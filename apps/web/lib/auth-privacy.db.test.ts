import { randomInt, randomUUID } from "node:crypto";
import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { appleProviderOptions, kakaoProviderOptions, privacyDatabaseHooks } from "./auth-privacy";

const { db, close } = openTestDb();
const BASE_URL = "http://localhost:3001";

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
  account: { updateAccountOnSignIn: false },
  databaseHooks: privacyDatabaseHooks,
  socialProviders: {
    kakao: kakaoProviderOptions({ clientId: "kakao-client", clientSecret: "kakao-secret" }),
    apple: appleProviderOptions({
      clientId: "ing.boogie.seedbook",
      clientSecret: "apple-secret",
      // 테스트용 서명 없는 id token 을 받는다.
      verifyIdToken: async () => true,
    }),
  },
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
});
