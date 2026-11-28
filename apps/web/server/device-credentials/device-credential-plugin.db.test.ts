import { randomUUID } from "node:crypto";
import { schema } from "@seedbook/database";
import { nativeAppAuthToken } from "@web/lib/native-auth-token";
import { openTestDb } from "@web/test/db/test-db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { deviceCredentialPlugin } from "./device-credential-plugin";

const { db, close } = openTestDb();
const BASE_URL = "http://localhost:3001";

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
  emailAndPassword: { enabled: true },
  plugins: [deviceCredentialPlugin({ db }), bearer(), nativeAppAuthToken()],
});

const createdEmails: string[] = [];
afterAll(async () => {
  for (const email of createdEmails) {
    await db.delete(schema.user).where(eq(schema.user.email, email));
  }
  await close();
});

/** 새 사용자로 가입해 로그인된 쿠키를 돌려준다. */
async function signUp(): Promise<{ cookie: string; userId: string }> {
  const email = `device-${randomUUID()}@test.local`;
  createdEmails.push(email);
  const response = await post("/sign-up/email", {
    body: { email, password: "password-1234", name: "tester" },
  });
  const body = (await response.json()) as { user: { id: string } };
  return { cookie: sessionCookie(response), userId: body.user.id };
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.getSetCookie().find((c) => c.includes("session_token="));
  if (!setCookie) throw new Error("no session cookie");
  return setCookie.split(";")[0] ?? "";
}

async function post(path: string, init: { body?: unknown; cookie?: string; origin?: string } = {}) {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: init.origin ?? BASE_URL,
        "user-agent": "SeedbookApp/1",
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      body: JSON.stringify(init.body ?? {}),
    })
  );
}

async function enroll(cookie: string): Promise<{ credentialId: string; token: string }> {
  const response = await post("/device-credential/enroll", { cookie });
  expect(response.status).toBe(200);
  return (await response.json()) as { credentialId: string; token: string };
}

async function sessionUserId(cookie: string): Promise<string | null> {
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  return session?.user.id ?? null;
}

describe("device credential sign-in (better-auth + real Postgres)", () => {
  it("signs the user in with an enrolled credential and sets a session cookie", async () => {
    const { cookie, userId } = await signUp();
    const credential = await enroll(cookie);

    const response = await post("/device-credential/sign-in", { body: credential });

    expect(response.status).toBe(200);
    expect(await sessionUserId(sessionCookie(response))).toBe(userId);
  });

  it("hands the native app a bearer token for the new session", async () => {
    const { cookie, userId } = await signUp();
    const credential = await enroll(cookie);

    const response = await post("/device-credential/sign-in", {
      body: credential,
      origin: "capacitor://localhost",
    });

    const token = response.headers.get("set-auth-token") ?? "";
    const session = await auth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${token}` }),
    });
    expect(session?.user.id).toBe(userId);
  });

  it("does not hand the session token to a browser (same-origin) request", async () => {
    const { cookie } = await signUp();
    const credential = await enroll(cookie);

    const response = await post("/device-credential/sign-in", { body: credential });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-auth-token")).toBeNull();
  });

  it("enrolls with a bearer session instead of a cookie", async () => {
    const { cookie } = await signUp();
    const signIn = await post("/device-credential/sign-in", {
      body: await enroll(cookie),
      origin: "https://localhost",
    });
    const token = signIn.headers.get("set-auth-token") ?? "";

    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/device-credential/enroll`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: BASE_URL,
          authorization: `Bearer ${token}`,
        },
        body: "{}",
      })
    );

    expect(response.status).toBe(200);
  });

  it("creates a new session instead of reusing the enrolling one", async () => {
    const { cookie } = await signUp();
    const credential = await enroll(cookie);

    const response = await post("/device-credential/sign-in", { body: credential });

    expect(sessionCookie(response)).not.toBe(cookie);
  });

  it("does not store the enrolling device's User-Agent", async () => {
    const { cookie } = await signUp();
    const { credentialId } = await enroll(cookie);

    const [row] = await db
      .select()
      .from(schema.deviceCredential)
      .where(eq(schema.deviceCredential.id, credentialId));

    expect(row?.userAgent).toBeNull();
  });

  it("rejects a wrong token without setting a cookie", async () => {
    const { cookie } = await signUp();
    const credential = await enroll(cookie);

    const response = await post("/device-credential/sign-in", {
      body: { credentialId: credential.credentialId, token: "wrong" },
    });

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("rejects a malformed body", async () => {
    const response = await post("/device-credential/sign-in", { body: { credentialId: 1 } });

    expect(response.status).toBe(400);
  });

  it("requires a signed-in user to enroll", async () => {
    const response = await post("/device-credential/enroll");

    expect(response.status).toBe(401);
  });

  it("requires a recent sign-in to enroll", async () => {
    const { cookie, userId } = await signUp();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db
      .update(schema.session)
      .set({ createdAt: twoDaysAgo })
      .where(eq(schema.session.userId, userId));

    const response = await post("/device-credential/enroll", { cookie });

    expect(response.status).toBe(403);
  });

  it("stops working after the owner revokes it", async () => {
    const { cookie } = await signUp();
    const credential = await enroll(cookie);

    const revoke = await post("/device-credential/revoke", {
      cookie,
      body: { credentialId: credential.credentialId },
    });
    const response = await post("/device-credential/sign-in", { body: credential });

    expect(revoke.status).toBe(200);
    expect(response.status).toBe(401);
  });
});
