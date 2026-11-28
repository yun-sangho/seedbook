import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { registerPushDevice, unregisterPushDevice } from "./push-devices";
import { createTestSession, testToken } from "./push-test-fixtures";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

const NOW = new Date("2026-11-28T08:00:00.000Z");
const INPUT = {
  platform: "ios",
  appId: "ing.boogie.seedbook",
  environment: "production",
  kinds: ["goal"],
} as const;

async function owner() {
  const userId = await createTestUser();
  return { userId, sessionId: await createTestSession(db, userId) };
}

async function deviceRow(token: string) {
  const [row] = await db.select().from(schema.pushDevice).where(eq(schema.pushDevice.token, token));
  return row;
}

describe("push devices", () => {
  it("registers a device with the session and enabled kinds", async () => {
    const me = await owner();
    const token = testToken();
    await registerPushDevice(db, me, { ...INPUT, token, kinds: ["goal"] }, NOW);
    expect(await deviceRow(token)).toMatchObject({ ...me, kinds: ["goal"] });
  });

  it("updates the kinds when the same device registers again", async () => {
    const me = await owner();
    const token = testToken();
    await registerPushDevice(db, me, { ...INPUT, token, kinds: ["goal"] }, NOW);
    await registerPushDevice(db, me, { ...INPUT, token, kinds: [] }, NOW);
    expect((await deviceRow(token))?.kinds).toEqual([]);
  });

  it("moves the token to the account that registered it last", async () => {
    const first = await owner();
    const second = await owner();
    const token = testToken();
    await registerPushDevice(db, first, { ...INPUT, token, kinds: ["goal"] }, NOW);
    await registerPushDevice(db, second, { ...INPUT, token, kinds: ["goal"] }, NOW);
    expect(await deviceRow(token)).toMatchObject(second);
  });

  it("drops the device when its session ends (sign-out)", async () => {
    const me = await owner();
    const token = testToken();
    await registerPushDevice(db, me, { ...INPUT, token, kinds: ["goal"] }, NOW);
    await db.delete(schema.session).where(eq(schema.session.id, me.sessionId));
    expect(await deviceRow(token)).toBeUndefined();
  });

  it("unregisters only the caller's token", async () => {
    const me = await owner();
    const other = await owner();
    const token = testToken();
    await registerPushDevice(db, me, { ...INPUT, token, kinds: ["goal"] }, NOW);
    await unregisterPushDevice(db, other.userId, token);
    expect(await deviceRow(token)).toBeDefined();
    await unregisterPushDevice(db, me.userId, token);
    expect(await deviceRow(token)).toBeUndefined();
  });
});
