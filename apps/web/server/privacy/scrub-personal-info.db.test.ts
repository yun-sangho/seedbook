import { randomUUID } from "node:crypto";
import { schema, scrubPersonalInfo } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const { db, close } = openTestDb();
const T0 = new Date("2026-11-01T00:00:00Z");
const T1 = new Date("2026-11-02T00:00:00Z");

const createdUserIds: string[] = [];
afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(schema.user).where(eq(schema.user.id, id));
  }
  await close();
});

/** 신상 정보 정책 전에 가입한 사용자 (카카오 프로필·토큰·세션 접속 정보가 남아 있다). */
async function createLegacyKakaoUser(kakaoId: string) {
  const userId = `legacy-${randomUUID()}`;
  createdUserIds.push(userId);
  await db.insert(schema.user).values({
    id: userId,
    name: "홍길동",
    email: `${userId}@kakao.example`,
    emailVerified: true,
    image: "https://k.kakaocdn.net/hong.jpg",
    createdAt: T0,
    updatedAt: T0,
  });
  await db.insert(schema.account).values({
    id: `account-${randomUUID()}`,
    accountId: kakaoId,
    providerId: "kakao",
    userId,
    accessToken: "kakao-access-token",
    refreshToken: "kakao-refresh-token",
    idToken: "kakao-id-token",
    accessTokenExpiresAt: T1,
    refreshTokenExpiresAt: T1,
    scope: "profile_nickname,profile_image,account_email",
    createdAt: T0,
    updatedAt: T0,
  });
  await db.insert(schema.session).values({
    id: `session-${randomUUID()}`,
    token: `token-${randomUUID()}`,
    userId,
    expiresAt: new Date("2100-01-01T00:00:00Z"),
    ipAddress: "203.0.113.7",
    userAgent: "Mozilla/5.0 (iPhone)",
    createdAt: T0,
    updatedAt: T0,
  });
  await db.insert(schema.deviceCredential).values({
    id: `credential-${randomUUID()}`,
    userId,
    tokenHash: "hash",
    userAgent: "SeedbookApp/1",
    createdAt: T0,
    lastUsedAt: T0,
  });
  return userId;
}

async function rowsOf(userId: string) {
  const [user] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
  const [account] = await db.select().from(schema.account).where(eq(schema.account.userId, userId));
  const [session] = await db.select().from(schema.session).where(eq(schema.session.userId, userId));
  const [credential] = await db
    .select()
    .from(schema.deviceCredential)
    .where(eq(schema.deviceCredential.userId, userId));
  return { user, account, session, credential };
}

function newKakaoId(): string {
  return String(Date.now()) + String(Math.floor(Math.random() * 1000));
}

describe("scrubPersonalInfo (real Postgres)", () => {
  it("replaces name, email and photo with the fixed values from the kakao id", async () => {
    const kakaoId = newKakaoId();
    const userId = await createLegacyKakaoUser(kakaoId);

    await scrubPersonalInfo(db);

    const { user } = await rowsOf(userId);
    expect(user).toMatchObject({
      email: `kakao-${kakaoId}@users.seedbook.invalid`,
      name: "사용자",
      image: null,
      emailVerified: false,
    });
  });

  it("clears OAuth tokens but keeps the kakao link", async () => {
    const kakaoId = newKakaoId();
    const userId = await createLegacyKakaoUser(kakaoId);

    await scrubPersonalInfo(db);

    const { account } = await rowsOf(userId);
    expect(account).toMatchObject({
      providerId: "kakao",
      accountId: kakaoId,
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    });
  });

  it("clears session IP/User-Agent and device credential User-Agent", async () => {
    const userId = await createLegacyKakaoUser(newKakaoId());

    await scrubPersonalInfo(db);

    const { session, credential } = await rowsOf(userId);
    expect(session).toMatchObject({ ipAddress: null, userAgent: null });
    expect(credential?.userAgent).toBeNull();
  });

  it("gives the same result when run again", async () => {
    const userId = await createLegacyKakaoUser(newKakaoId());
    await scrubPersonalInfo(db);
    const once = await rowsOf(userId);

    await scrubPersonalInfo(db);

    expect(await rowsOf(userId)).toEqual(once);
  });

  it("leaves a name chosen after the scrub alone when run again", async () => {
    const userId = await createLegacyKakaoUser(newKakaoId());
    await scrubPersonalInfo(db);
    await db.update(schema.user).set({ name: "씨앗이" }).where(eq(schema.user.id, userId));

    await scrubPersonalInfo(db);

    expect((await rowsOf(userId)).user?.name).toBe("씨앗이");
  });

  it("leaves users without a social account alone", async () => {
    const userId = `credential-${randomUUID()}`;
    createdUserIds.push(userId);
    await db.insert(schema.user).values({
      id: userId,
      name: "개발자",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: T0,
      updatedAt: T0,
    });

    await scrubPersonalInfo(db);

    const { user } = await rowsOf(userId);
    expect(user).toMatchObject({ name: "개발자", email: `${userId}@test.local` });
  });
});
