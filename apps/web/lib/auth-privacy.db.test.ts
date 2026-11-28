import { randomInt, randomUUID } from "node:crypto";
import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  appleProviderOptions,
  kakaoProviderOptions,
  privacyAccountOptions,
  privacyDatabaseHooks,
} from "./auth-privacy";
import { NATIVE_APP_ORIGINS } from "./cors";
import { createKakaoIdTokenVerifier, KAKAO_ISSUER } from "./kakao-id-token";

const { db, close } = openTestDb();
const BASE_URL = "http://localhost:3001";

// 카카오 SDK 가 주는 ID 토큰을 흉내 낸다 — 테스트 키로 서명하고 그 공개키로 검증한다.
const KAKAO_NATIVE_APP_KEY = "kakao-native-app-key";
const kakaoSigningKey = await generateKeyPair("RS256");
const kakaoJwks = createLocalJWKSet({
  keys: [{ ...(await exportJWK(kakaoSigningKey.publicKey)), kid: "kakao-test", alg: "RS256" }],
});

// `lib/auth.ts` 와 같은 신상 정보 설정. 카카오는 실제 OAuth 콜백을, Apple 은 id token 로그인을 탄다.
const auth = betterAuth({
  baseURL: BASE_URL,
  secret: "test-secret-test-secret-test-secret",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  user: { deleteUser: { enabled: true } },
  account: privacyAccountOptions,
  databaseHooks: privacyDatabaseHooks(db),
  socialProviders: {
    kakao: kakaoProviderOptions({
      clientId: "kakao-client",
      clientSecret: "kakao-secret",
      verifyIdToken: createKakaoIdTokenVerifier({
        audiences: [KAKAO_NATIVE_APP_KEY],
        jwks: kakaoJwks,
      }),
    }),
    apple: appleProviderOptions({
      clientId: "ing.boogie.seedbook",
      clientSecret: "apple-secret",
      // 테스트용 서명 없는 id token 을 받는다.
      verifyIdToken: async () => true,
    }),
  },
  plugins: [bearer()],
  trustedOrigins: [...NATIVE_APP_ORIGINS],
});

const CLIENT_HEADERS = {
  "user-agent": "Mozilla/5.0 (iPhone) Test",
  "x-forwarded-for": "203.0.113.7",
};

/** 카카오가 동의 항목을 (설정 실수로) 내려 줘도 저장하지 않는지 보려고 신상 정보를 채워 둔다. */
function kakaoProfile(id: number) {
  return {
    id,
    kakao_account: {
      email: "hong@kakao.example",
      is_email_valid: true,
      is_email_verified: true,
      profile: { nickname: "홍길동", profile_image_url: "https://k.kakaocdn.net/hong.jpg" },
    },
  };
}

function stubKakaoServers(id: number) {
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://kauth.kakao.com/oauth/token")) {
      return Response.json({
        access_token: "kakao-access-token",
        refresh_token: "kakao-refresh-token",
        token_type: "bearer",
        expires_in: 21599,
        refresh_token_expires_in: 5183999,
      });
    }
    if (url.startsWith("https://kapi.kakao.com/v2/user/me")) {
      return Response.json(kakaoProfile(id));
    }
    return realFetch(input, init);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const createdEmails: string[] = [];
afterAll(async () => {
  for (const email of createdEmails) {
    await db.delete(schema.user).where(eq(schema.user.email, email));
  }
  await close();
});

function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** 카카오 로그인 왕복 (시작 → 카카오 → 콜백). 로그인된 사용자 id 를 돌려준다. */
async function signInWithKakao(kakaoId: number): Promise<string> {
  return sessionUserId(await kakaoSessionCookie(kakaoId));
}

/** 카카오로 로그인한 세션 쿠키. */
async function kakaoSessionCookie(kakaoId: number): Promise<string> {
  createdEmails.push(`kakao-${kakaoId}@users.seedbook.invalid`);
  stubKakaoServers(kakaoId);

  const start = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL, ...CLIENT_HEADERS },
      body: JSON.stringify({ provider: "kakao", callbackURL: "/m" }),
    })
  );
  const { url } = (await start.json()) as { url: string };
  const authorizeUrl = new URL(url);
  const state = authorizeUrl.searchParams.get("state") ?? "";

  const callback = await auth.handler(
    new Request(`${BASE_URL}/api/auth/callback/kakao?code=kakao-code&state=${state}`, {
      headers: { cookie: cookiesFrom(start), ...CLIENT_HEADERS },
    })
  );
  expect(callback.headers.get("location")).toBe("/m");
  return cookiesFrom(callback);
}

function unsignedJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.`;
}

async function signInWithApple(sub: string): Promise<string> {
  createdEmails.push(`apple-${sub}@users.seedbook.invalid`.toLowerCase());
  const response = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL, ...CLIENT_HEADERS },
      body: JSON.stringify({
        provider: "apple",
        idToken: {
          token: unsignedJwt({
            iss: "https://appleid.apple.com",
            aud: "ing.boogie.seedbook",
            sub,
            email: "hong@privaterelay.appleid.com",
            email_verified: true,
          }),
          user: { name: { firstName: "길동", lastName: "홍" } },
        },
      }),
    })
  );
  expect(response.status).toBe(200);
  return sessionUserId(cookiesFrom(response));
}

async function sessionUserId(cookie: string): Promise<string> {
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (!session) throw new Error("not signed in");
  return session.user.id;
}

async function userRow(userId: string) {
  const [row] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
  return row;
}

async function accountRows(userId: string) {
  return db.select().from(schema.account).where(eq(schema.account.userId, userId));
}

async function sessionRows(userId: string) {
  return db.select().from(schema.session).where(eq(schema.session.userId, userId));
}

describe("kakao sign-in without personal info (better-auth + real Postgres)", () => {
  it("creates the user from the kakao id only", async () => {
    const kakaoId = randomInt(1, 2 ** 40);

    const userId = await signInWithKakao(kakaoId);

    expect(await userRow(userId)).toMatchObject({
      email: `kakao-${kakaoId}@users.seedbook.invalid`,
      name: "사용자",
      image: null,
      emailVerified: false,
    });
  });

  it("keeps no OAuth tokens on the account", async () => {
    const userId = await signInWithKakao(randomInt(1, 2 ** 40));

    const [account] = await accountRows(userId);

    expect(account).toMatchObject({
      providerId: "kakao",
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    });
  });

  it("keeps no IP address or User-Agent on the session", async () => {
    const userId = await signInWithKakao(randomInt(1, 2 ** 40));

    const [session] = await sessionRows(userId);

    expect(session).toMatchObject({ ipAddress: null, userAgent: null });
  });

  it("signs the same kakao user back into the same account", async () => {
    const kakaoId = randomInt(1, 2 ** 40);
    const first = await signInWithKakao(kakaoId);

    const second = await signInWithKakao(kakaoId);

    expect(second).toBe(first);
    expect(await accountRows(first)).toHaveLength(1);
  });

  it("does not overwrite a name the user chose when signing in again", async () => {
    const kakaoId = randomInt(1, 2 ** 40);
    const userId = await signInWithKakao(kakaoId);
    await db.update(schema.user).set({ name: "씨앗이" }).where(eq(schema.user.id, userId));

    await signInWithKakao(kakaoId);

    expect((await userRow(userId))?.name).toBe("씨앗이");
  });

  it("does not ask kakao for any consent item", async () => {
    const start = await auth.api.signInSocial({
      body: { provider: "kakao", callbackURL: "/m", disableRedirect: true },
    });

    expect(new URL(start.url ?? "").searchParams.get("scope") ?? "").toBe("");
  });
});

describe("apple sign-in without personal info (better-auth + real Postgres)", () => {
  it("creates the user from the apple sub only", async () => {
    const sub = `001234.${randomUUID().replaceAll("-", "")}.0123`;

    const userId = await signInWithApple(sub);

    expect(await userRow(userId)).toMatchObject({
      email: `apple-${sub}@users.seedbook.invalid`,
      name: "사용자",
      image: null,
    });
    const [account] = await accountRows(userId);
    expect(account).toMatchObject({ providerId: "apple", accountId: sub, idToken: null });
  });

  it("signs the same apple user back into the same account", async () => {
    const sub = `001234.${randomUUID().replaceAll("-", "")}.0123`;
    const first = await signInWithApple(sub);

    const second = await signInWithApple(sub);

    expect(second).toBe(first);
  });
});

describe("profile update keeps only a nickname and a seed avatar", () => {
  async function updateUser(cookie: string, body: Record<string, unknown>) {
    return auth.handler(
      new Request(`${BASE_URL}/api/auth/update-user`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL, cookie },
        body: JSON.stringify(body),
      })
    );
  }

  it("stores the nickname and the seed avatar key", async () => {
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));
    const userId = await sessionUserId(cookie);

    const response = await updateUser(cookie, { name: "  푸른   새싹 ", image: "seed:pot-2-mint" });

    expect(response.status).toBe(200);
    expect(await userRow(userId)).toMatchObject({ name: "푸른 새싹", image: "seed:pot-2-mint" });
  });

  it("rejects a photo URL", async () => {
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));
    const userId = await sessionUserId(cookie);

    const response = await updateUser(cookie, { image: "https://k.kakaocdn.net/hong.jpg" });

    expect(response.status).toBe(400);
    expect((await userRow(userId))?.image).toBeNull();
  });

  it("rejects a nickname over the length limit", async () => {
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));
    const userId = await sessionUserId(cookie);

    const response = await updateUser(cookie, { name: "가".repeat(13) });

    expect(response.status).toBe(400);
    expect((await userRow(userId))?.name).toBe("사용자");
  });

  it("rejects a banned nickname", async () => {
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));

    const response = await updateUser(cookie, { name: "Seedbook 운영자" });

    expect(response.status).toBe(400);
  });

  it("keeps the nickname when a later kakao sign-in happens", async () => {
    const kakaoId = randomInt(1, 2 ** 40);
    const cookie = await kakaoSessionCookie(kakaoId);
    await updateUser(cookie, { name: "알뜰한 도토리", image: "seed:seed-1-sun" });

    const userId = await signInWithKakao(kakaoId);

    expect(await userRow(userId)).toMatchObject({
      name: "알뜰한 도토리",
      image: "seed:seed-1-sun",
    });
  });

  async function insertPortfolio(userId: string) {
    const id = randomUUID();
    await db.insert(schema.portfolio).values({ id, userId, name: "안정형", color: "#111" });
    return id;
  }

  it("stores a plant of the user's own portfolio with the seed avatar", async () => {
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));
    const userId = await sessionUserId(cookie);
    const image = `plant:${await insertPortfolio(userId)}|seed:pot-2-mint`;

    const response = await updateUser(cookie, { image });

    expect(response.status).toBe(200);
    expect((await userRow(userId))?.image).toBe(image);
  });

  it("accepts a plant of a portfolio the server does not have (local mode)", async () => {
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));

    const response = await updateUser(cookie, { image: `plant:${randomUUID()}|seed:pot-2-mint` });

    expect(response.status).toBe(200);
  });

  it("rejects a plant of another user's portfolio", async () => {
    const owner = await sessionUserId(await kakaoSessionCookie(randomInt(1, 2 ** 40)));
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));
    const userId = await sessionUserId(cookie);

    const response = await updateUser(cookie, {
      image: `plant:${await insertPortfolio(owner)}|seed:pot-2-mint`,
    });

    expect(response.status).toBe(400);
    expect((await userRow(userId))?.image).toBeNull();
  });

  it("rejects a plant without the seed avatar", async () => {
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));
    const userId = await sessionUserId(cookie);

    const response = await updateUser(cookie, { image: `plant:${await insertPortfolio(userId)}` });

    expect(response.status).toBe(400);
  });
});

describe("linking another login method (better-auth + real Postgres)", () => {
  const LINK_RETURN = "/assets/settings/login-methods";

  function appleSub() {
    return `001234.${randomUUID().replaceAll("-", "")}.0123`;
  }

  /** Apple 로 로그인한 세션 쿠키. */
  async function appleSessionCookie(sub: string): Promise<string> {
    createdEmails.push(`apple-${sub}@users.seedbook.invalid`.toLowerCase());
    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL, ...CLIENT_HEADERS },
        body: JSON.stringify({
          provider: "apple",
          idToken: { token: unsignedJwt({ iss: "https://appleid.apple.com", sub }) },
        }),
      })
    );
    expect(response.status).toBe(200);
    return cookiesFrom(response);
  }

  /**
   * 로그인한 채로 카카오를 연결하는 왕복 (연결 시작 → 카카오 → 콜백). 웹과 앱(WebView)이 타는 리다이렉트
   * 흐름이다. 콜백이 보내는 주소를 돌려준다.
   */
  async function linkKakao(sessionCookie: string, kakaoId: number): Promise<string> {
    stubKakaoServers(kakaoId);
    const start = await auth.handler(
      new Request(`${BASE_URL}/api/auth/link-social`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: BASE_URL,
          cookie: sessionCookie,
          ...CLIENT_HEADERS,
        },
        body: JSON.stringify({
          provider: "kakao",
          callbackURL: `${LINK_RETURN}?linked=kakao`,
          errorCallbackURL: `${LINK_RETURN}?linking=kakao`,
        }),
      })
    );
    expect(start.status).toBe(200);
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get("state") ?? "";
    const startCookies = cookiesFrom(start);

    const callback = await auth.handler(
      new Request(`${BASE_URL}/api/auth/callback/kakao?code=kakao-code&state=${state}`, {
        headers: {
          cookie: [sessionCookie, startCookies].filter(Boolean).join("; "),
          ...CLIENT_HEADERS,
        },
      })
    );
    return callback.headers.get("location") ?? "";
  }

  /** 로그인한 채로 Apple 을 id token 으로 연결한다. */
  async function linkAppleWithIdToken(sessionCookie: string, sub: string) {
    return auth.handler(
      new Request(`${BASE_URL}/api/auth/link-social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL, cookie: sessionCookie },
        body: JSON.stringify({
          provider: "apple",
          idToken: { token: unsignedJwt({ iss: "https://appleid.apple.com", sub }) },
        }),
      })
    );
  }

  async function unlink(sessionCookie: string, accountRowId: string) {
    return auth.handler(
      new Request(`${BASE_URL}/api/auth/unlink-account`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL, cookie: sessionCookie },
        body: JSON.stringify({ accountId: accountRowId }),
      })
    );
  }

  async function providers(userId: string) {
    return (await accountRows(userId)).map((a) => a.providerId).sort();
  }

  it("links kakao to an apple user although their fixed emails differ", async () => {
    const cookie = await appleSessionCookie(appleSub());
    const userId = await sessionUserId(cookie);
    const kakaoId = randomInt(1, 2 ** 40);

    const location = await linkKakao(cookie, kakaoId);

    expect(location).toBe(`${LINK_RETURN}?linked=kakao`);
    expect(await providers(userId)).toEqual(["apple", "kakao"]);
  });

  it("signs the linked kakao into the same user and creates no other user", async () => {
    const cookie = await appleSessionCookie(appleSub());
    const userId = await sessionUserId(cookie);
    const kakaoId = randomInt(1, 2 ** 40);
    await linkKakao(cookie, kakaoId);

    const signedIn = await signInWithKakao(kakaoId);

    expect(signedIn).toBe(userId);
    const kakaoEmailUsers = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, `kakao-${kakaoId}@users.seedbook.invalid`));
    expect(kakaoEmailUsers).toHaveLength(0);
  });

  it("keeps no OAuth tokens on the linked account", async () => {
    const cookie = await appleSessionCookie(appleSub());
    const userId = await sessionUserId(cookie);

    await linkKakao(cookie, randomInt(1, 2 ** 40));

    const kakao = (await accountRows(userId)).find((a) => a.providerId === "kakao");
    expect(kakao).toMatchObject({
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    });
  });

  it("keeps the user's fixed email, nickname and avatar when linking", async () => {
    const sub = appleSub();
    const cookie = await appleSessionCookie(sub);
    const userId = await sessionUserId(cookie);
    await db
      .update(schema.user)
      .set({ name: "알뜰한 도토리", image: "seed:seed-1-sun" })
      .where(eq(schema.user.id, userId));

    await linkKakao(cookie, randomInt(1, 2 ** 40));

    expect(await userRow(userId)).toMatchObject({
      email: `apple-${sub}@users.seedbook.invalid`.toLowerCase(),
      name: "알뜰한 도토리",
      image: "seed:seed-1-sun",
      emailVerified: false,
    });
  });

  it("refuses kakao that already belongs to another user and moves nothing", async () => {
    const kakaoId = randomInt(1, 2 ** 40);
    const kakaoUser = await signInWithKakao(kakaoId);
    const cookie = await appleSessionCookie(appleSub());
    const appleUser = await sessionUserId(cookie);

    const location = await linkKakao(cookie, kakaoId);

    expect(location).toBe(
      `${LINK_RETURN}?linking=kakao&error=account_already_linked_to_different_user`
    );
    expect(await providers(appleUser)).toEqual(["apple"]);
    expect(await providers(kakaoUser)).toEqual(["kakao"]);
  });

  it("links apple to a kakao user with an id token (native sign-in shape)", async () => {
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));
    const userId = await sessionUserId(cookie);
    const sub = appleSub();

    const response = await linkAppleWithIdToken(cookie, sub);

    expect(response.status).toBe(200);
    expect(await providers(userId)).toEqual(["apple", "kakao"]);
    expect(await signInWithApple(sub)).toBe(userId);
  });

  it("refuses an apple id token that already belongs to another user", async () => {
    const sub = appleSub();
    const appleUser = await sessionUserId(await appleSessionCookie(sub));
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));
    const kakaoUser = await sessionUserId(cookie);

    const response = await linkAppleWithIdToken(cookie, sub);

    expect(response.status).toBe(409);
    expect(await providers(kakaoUser)).toEqual(["kakao"]);
    expect(await providers(appleUser)).toEqual(["apple"]);
  });

  it("does not unlink the last login method", async () => {
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));
    const userId = await sessionUserId(cookie);
    const [account] = await accountRows(userId);

    const response = await unlink(cookie, account?.id ?? "");

    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe(
      "FAILED_TO_UNLINK_LAST_ACCOUNT"
    );
    expect(await providers(userId)).toEqual(["kakao"]);
  });

  it("unlinks one of two login methods", async () => {
    const cookie = await appleSessionCookie(appleSub());
    const userId = await sessionUserId(cookie);
    await linkKakao(cookie, randomInt(1, 2 ** 40));
    const kakao = (await accountRows(userId)).find((a) => a.providerId === "kakao");

    const response = await unlink(cookie, kakao?.id ?? "");

    expect(response.status).toBe(200);
    expect(await providers(userId)).toEqual(["apple"]);
  });

  it("does not join an unlinked method back by its fixed email when signing in with it", async () => {
    // Apple 로 가입 → 카카오 연결 → Apple 해제. 사용자의 고정 이메일은 여전히 apple-<sub>@… 이다.
    const sub = appleSub();
    const cookie = await appleSessionCookie(sub);
    const userId = await sessionUserId(cookie);
    await linkKakao(cookie, randomInt(1, 2 ** 40));
    const apple = (await accountRows(userId)).find((a) => a.providerId === "apple");
    await unlink(cookie, apple?.id ?? "");

    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL },
        body: JSON.stringify({
          provider: "apple",
          idToken: { token: unsignedJwt({ iss: "https://appleid.apple.com", sub }) },
        }),
      })
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await providers(userId)).toEqual(["kakao"]);
  });
});

describe("native app sign-in: kakao SDK id token + bearer session (better-auth + real Postgres)", () => {
  const APP_ORIGIN = "capacitor://localhost";
  const NONCE = "nonce-from-the-app";

  async function kakaoIdToken(kakaoId: number, signWith = kakaoSigningKey.privateKey) {
    return new SignJWT({ nonce: NONCE })
      .setProtectedHeader({ alg: "RS256", kid: "kakao-test" })
      .setIssuer(KAKAO_ISSUER)
      .setAudience(KAKAO_NATIVE_APP_KEY)
      .setSubject(String(kakaoId))
      .setIssuedAt()
      .setExpirationTime("6h")
      .sign(signWith);
  }

  /** 앱 번들이 보내는 모양: 앱 origin, 쿠키 없음. */
  async function nativeKakaoSignIn(token: string, nonce = NONCE) {
    return auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_ORIGIN, ...CLIENT_HEADERS },
        body: JSON.stringify({ provider: "kakao", idToken: { token, nonce } }),
      })
    );
  }

  async function bearerUserId(token: string): Promise<string | null> {
    const session = await auth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${token}` }),
    });
    return session?.user.id ?? null;
  }

  it("signs in with a kakao id token and hands the session token to the app", async () => {
    const kakaoId = randomInt(1, 2 ** 40);
    createdEmails.push(`kakao-${kakaoId}@users.seedbook.invalid`);

    const response = await nativeKakaoSignIn(await kakaoIdToken(kakaoId));

    expect(response.status).toBe(200);
    const token = response.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    const userId = await bearerUserId(token ?? "");
    expect(await userRow(userId ?? "")).toMatchObject({
      email: `kakao-${kakaoId}@users.seedbook.invalid`,
      name: "사용자",
      image: null,
    });
  });

  it("lands on the same account the web kakao login created", async () => {
    const kakaoId = randomInt(1, 2 ** 40);
    const webUserId = await signInWithKakao(kakaoId);

    const response = await nativeKakaoSignIn(await kakaoIdToken(kakaoId));

    expect(await bearerUserId(response.headers.get("set-auth-token") ?? "")).toBe(webUserId);
    expect(await accountRows(webUserId)).toHaveLength(1);
  });

  it("keeps no kakao id token on the account", async () => {
    const kakaoId = randomInt(1, 2 ** 40);
    createdEmails.push(`kakao-${kakaoId}@users.seedbook.invalid`);
    const response = await nativeKakaoSignIn(await kakaoIdToken(kakaoId));
    const userId = await bearerUserId(response.headers.get("set-auth-token") ?? "");

    const [account] = await accountRows(userId ?? "");

    expect(account).toMatchObject({ providerId: "kakao", accessToken: null, idToken: null });
  });

  it("rejects an id token not signed by kakao and creates no user", async () => {
    const kakaoId = randomInt(1, 2 ** 40);
    const forger = await generateKeyPair("RS256");

    const response = await nativeKakaoSignIn(await kakaoIdToken(kakaoId, forger.privateKey));

    expect(response.status).toBe(401);
    expect(response.headers.get("set-auth-token")).toBeNull();
    const rows = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, `kakao-${kakaoId}@users.seedbook.invalid`));
    expect(rows).toHaveLength(0);
  });

  it("rejects an id token whose nonce is not the one the app sent", async () => {
    const response = await nativeKakaoSignIn(
      await kakaoIdToken(randomInt(1, 2 ** 40)),
      "another-nonce"
    );

    expect(response.status).toBe(401);
  });

  it("ends the bearer session on sign-out", async () => {
    const kakaoId = randomInt(1, 2 ** 40);
    createdEmails.push(`kakao-${kakaoId}@users.seedbook.invalid`);
    const token =
      (await nativeKakaoSignIn(await kakaoIdToken(kakaoId))).headers.get("set-auth-token") ?? "";

    const signOut = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: APP_ORIGIN,
          authorization: `Bearer ${token}`,
        },
        body: "{}",
      })
    );

    expect(signOut.status).toBe(200);
    expect(await bearerUserId(token)).toBeNull();
  });

  it("deletes the account with the bearer session (fresh sign-in)", async () => {
    const kakaoId = randomInt(1, 2 ** 40);
    const token =
      (await nativeKakaoSignIn(await kakaoIdToken(kakaoId))).headers.get("set-auth-token") ?? "";
    const userId = await bearerUserId(token);

    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/delete-user`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: APP_ORIGIN,
          authorization: `Bearer ${token}`,
        },
        body: "{}",
      })
    );

    expect(response.status).toBe(200);
    expect(await userRow(userId ?? "")).toBeUndefined();
  });

  it("switches accounts: a new sign-in hands over the other user's token", async () => {
    const first = randomInt(1, 2 ** 40);
    const second = randomInt(1, 2 ** 40);
    createdEmails.push(
      `kakao-${first}@users.seedbook.invalid`,
      `kakao-${second}@users.seedbook.invalid`
    );
    const firstToken =
      (await nativeKakaoSignIn(await kakaoIdToken(first))).headers.get("set-auth-token") ?? "";

    const secondToken =
      (await nativeKakaoSignIn(await kakaoIdToken(second))).headers.get("set-auth-token") ?? "";

    expect(secondToken).not.toBe(firstToken);
    expect(await bearerUserId(secondToken)).not.toBe(await bearerUserId(firstToken));
  });

  it("keeps the web cookie session working next to bearer", async () => {
    const cookie = await kakaoSessionCookie(randomInt(1, 2 ** 40));

    expect(await sessionUserId(cookie)).toBeTruthy();
  });
});
