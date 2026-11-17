import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type Database, schema } from "@seedbook/database";
import { and, eq } from "drizzle-orm";

/**
 * 생체 인증 로그인용 기기 자격 증명. 네이티브 앱이 로그인한 상태에서 토큰을 발급받아 Keychain
 * (iOS) / Keystore (Android) 에 생체 인증으로 잠가 두고, 세션이 없을 때 생체 인증으로 꺼내 다시
 * 로그인한다 (`lib/device-credential-plugin.ts`). 흔히 refresh token 을 생체 인증으로 보호하는
 * 방식과 같다 — better-auth 세션에는 refresh token 이 없어 이 토큰이 그 역할을 한다.
 *
 * 서버에는 토큰의 SHA-256 해시만 둔다. 토큰은 256 비트 난수라 솔트·느린 해시가 필요 없다.
 * 쓸 때마다 만료가 미뤄지고, `DEVICE_CREDENTIAL_IDLE_TTL_MS` 동안 쓰지 않으면 지운다.
 */

export const DEVICE_CREDENTIAL_IDLE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const TOKEN_BYTES = 32;
const ID_BYTES = 16;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createDeviceCredential(
  db: Database,
  input: { userId: string; userAgent: string | null; now: Date }
): Promise<{ credentialId: string; token: string }> {
  const credentialId = randomBytes(ID_BYTES).toString("base64url");
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  await db.insert(schema.deviceCredential).values({
    id: credentialId,
    userId: input.userId,
    tokenHash: hashToken(token),
    userAgent: input.userAgent,
    createdAt: input.now,
    lastUsedAt: input.now,
  });
  return { credentialId, token };
}

/** 토큰이 맞으면 주인의 userId. 틀리거나, 없거나, 오래 쓰지 않아 만료됐으면 null. */
export async function verifyDeviceCredential(
  db: Database,
  input: { credentialId: string; token: string; now: Date }
): Promise<string | null> {
  const row = await db.query.deviceCredential.findFirst({
    where: (t, { eq }) => eq(t.id, input.credentialId),
  });
  if (!row || !tokenMatches(input.token, row.tokenHash)) return null;

  if (input.now.getTime() - row.lastUsedAt.getTime() > DEVICE_CREDENTIAL_IDLE_TTL_MS) {
    await db.delete(schema.deviceCredential).where(eq(schema.deviceCredential.id, row.id));
    return null;
  }

  await db
    .update(schema.deviceCredential)
    .set({ lastUsedAt: input.now })
    .where(eq(schema.deviceCredential.id, row.id));
  return row.userId;
}

/** 본인 자격 증명만 지운다. 없거나 다른 사람 것이면 아무 일도 하지 않는다. */
export async function revokeDeviceCredential(
  db: Database,
  input: { userId: string; credentialId: string }
): Promise<void> {
  await db
    .delete(schema.deviceCredential)
    .where(
      and(
        eq(schema.deviceCredential.id, input.credentialId),
        eq(schema.deviceCredential.userId, input.userId)
      )
    );
}
