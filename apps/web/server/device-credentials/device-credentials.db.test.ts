import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  createDeviceCredential,
  DEVICE_CREDENTIAL_IDLE_TTL_MS,
  revokeDeviceCredential,
  verifyDeviceCredential,
} from "./device-credentials";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-11-01T00:00:00Z");

function at(offsetMs: number): Date {
  return new Date(T0.getTime() + offsetMs);
}

async function credentialRow(credentialId: string) {
  return db.query.deviceCredential.findFirst({
    where: (t, { eq }) => eq(t.id, credentialId),
  });
}

describe("device credentials for biometric sign-in (real Postgres)", () => {
  it("signs the owner back in with the issued token", async () => {
    const userId = await createTestUser();
    const { credentialId, token } = await createDeviceCredential(db, {
      userId,
      userAgent: "SeedbookApp/1",
      now: T0,
    });

    const result = await verifyDeviceCredential(db, { credentialId, token, now: at(DAY_MS) });

    expect(result).toBe(userId);
  });

  it("stores only a hash of the token", async () => {
    const userId = await createTestUser();
    const { credentialId, token } = await createDeviceCredential(db, {
      userId,
      userAgent: null,
      now: T0,
    });

    const row = await credentialRow(credentialId);
    expect(row?.tokenHash).toBeTruthy();
    expect(row?.tokenHash).not.toContain(token);
  });

  it("issues a different token every time", async () => {
    const userId = await createTestUser();
    const first = await createDeviceCredential(db, { userId, userAgent: null, now: T0 });
    const second = await createDeviceCredential(db, { userId, userAgent: null, now: T0 });

    expect(first.token).not.toBe(second.token);
    expect(first.credentialId).not.toBe(second.credentialId);
  });

  it("rejects a wrong token and keeps the credential", async () => {
    const userId = await createTestUser();
    const { credentialId, token } = await createDeviceCredential(db, {
      userId,
      userAgent: null,
      now: T0,
    });

    const result = await verifyDeviceCredential(db, {
      credentialId,
      token: `${token}x`,
      now: at(DAY_MS),
    });

    expect(result).toBeNull();
    expect(await credentialRow(credentialId)).toBeDefined();
  });

  it("rejects an unknown credential", async () => {
    const result = await verifyDeviceCredential(db, {
      credentialId: "does-not-exist",
      token: "whatever",
      now: T0,
    });

    expect(result).toBeNull();
  });

  it("expires a credential left unused for the idle period and deletes it", async () => {
    const userId = await createTestUser();
    const { credentialId, token } = await createDeviceCredential(db, {
      userId,
      userAgent: null,
      now: T0,
    });

    const result = await verifyDeviceCredential(db, {
      credentialId,
      token,
      now: at(DEVICE_CREDENTIAL_IDLE_TTL_MS + 1),
    });

    expect(result).toBeNull();
    expect(await credentialRow(credentialId)).toBeUndefined();
  });

  it("extends the idle period every time it is used", async () => {
    const userId = await createTestUser();
    const { credentialId, token } = await createDeviceCredential(db, {
      userId,
      userAgent: null,
      now: T0,
    });
    const almostIdle = DEVICE_CREDENTIAL_IDLE_TTL_MS - DAY_MS;

    await verifyDeviceCredential(db, { credentialId, token, now: at(almostIdle) });
    const result = await verifyDeviceCredential(db, {
      credentialId,
      token,
      now: at(almostIdle * 2),
    });

    expect(result).toBe(userId);
  });

  it("revokes the owner's credential", async () => {
    const userId = await createTestUser();
    const { credentialId, token } = await createDeviceCredential(db, {
      userId,
      userAgent: null,
      now: T0,
    });

    await revokeDeviceCredential(db, { userId, credentialId });

    expect(await verifyDeviceCredential(db, { credentialId, token, now: T0 })).toBeNull();
  });

  it("does not let another user revoke the credential", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const { credentialId, token } = await createDeviceCredential(db, {
      userId: owner,
      userAgent: null,
      now: T0,
    });

    await revokeDeviceCredential(db, { userId: other, credentialId });

    expect(await verifyDeviceCredential(db, { credentialId, token, now: T0 })).toBe(owner);
  });

  it("is removed with the user (account deletion)", async () => {
    const userId = await createTestUser();
    const { credentialId } = await createDeviceCredential(db, {
      userId,
      userAgent: null,
      now: T0,
    });

    await db.delete(schema.user).where(eq(schema.user.id, userId));

    expect(await credentialRow(credentialId)).toBeUndefined();
  });
});
