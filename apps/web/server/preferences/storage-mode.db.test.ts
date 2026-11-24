import { randomUUID } from "node:crypto";
import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { chooseStorageMode, readStorageMode, STORAGE_CHOICE_SINCE } from "./storage-mode";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

const now = new Date("2026-11-25T01:00:00.000Z");
const later = new Date("2026-11-25T02:00:00.000Z");
const BEFORE = new Date(STORAGE_CHOICE_SINCE.getTime() - 1);

const row = (userId: string) =>
  db.query.userPreference.findFirst({ where: (t, { eq }) => eq(t.userId, userId) });

async function createUserAt(createdAt: Date) {
  const userId = await createTestUser();
  await db.update(schema.user).set({ createdAt }).where(eq(schema.user.id, userId));
  return userId;
}

describe("reading the storage mode (real Postgres)", () => {
  it("asks a new user, who has no mode in use yet", async () => {
    const userId = await createUserAt(STORAGE_CHOICE_SINCE);

    expect(await readStorageMode(db, userId)).toEqual({
      storageMode: "local",
      chosen: false,
      inUse: false,
    });
  });

  it("asks a user who signed up before the choice existed, with the mode they have been using", async () => {
    const userId = await createUserAt(BEFORE);

    expect(await readStorageMode(db, userId)).toEqual({
      storageMode: "local",
      chosen: false,
      inUse: true,
    });
  });

  it("asks an existing cloud user and reports cloud", async () => {
    const userId = await createUserAt(BEFORE);
    await db.insert(schema.userPreference).values({ userId, storageMode: "cloud" });

    expect(await readStorageMode(db, userId)).toMatchObject({
      storageMode: "cloud",
      chosen: false,
      inUse: true,
    });
  });

  it("treats a user with data on the server as already using a mode", async () => {
    const userId = await createUserAt(STORAGE_CHOICE_SINCE);
    await db
      .insert(schema.portfolio)
      .values({ id: randomUUID(), userId, name: "p", color: "#000000" });

    expect(await readStorageMode(db, userId)).toMatchObject({ inUse: true });
  });

  it("does not write anything", async () => {
    const userId = await createTestUser();

    await readStorageMode(db, userId);

    expect(await row(userId)).toBeUndefined();
  });
});

describe("choosing the storage mode (real Postgres)", () => {
  it.each(["local", "cloud"] as const)("stops asking after %s is chosen", async (mode) => {
    const userId = await createTestUser();

    expect(await chooseStorageMode(db, userId, mode, now)).toBe(true);

    expect(await readStorageMode(db, userId)).toEqual({
      storageMode: mode,
      chosen: true,
      inUse: true,
    });
  });

  it("keeps the user's other preferences", async () => {
    const userId = await createTestUser();
    await db.insert(schema.userPreference).values({ userId, rebalancingTaskSort: "evalAsc" });

    await chooseStorageMode(db, userId, "cloud", now);

    expect(await row(userId)).toMatchObject({
      rebalancingTaskSort: "evalAsc",
      storageMode: "cloud",
      storageModeChosenAt: now,
    });
  });

  it("changes the mode again from settings and keeps the first time", async () => {
    const userId = await createTestUser();
    await chooseStorageMode(db, userId, "cloud", now);

    await chooseStorageMode(db, userId, "local", later);

    expect(await row(userId)).toMatchObject({ storageMode: "local", storageModeChosenAt: now });
  });

  it("does not let a stale first-choice screen undo a choice made on another device", async () => {
    const userId = await createTestUser();
    await chooseStorageMode(db, userId, "cloud", now);

    const accepted = await chooseStorageMode(db, userId, "local", later, { onlyIfUnchosen: true });

    expect(accepted).toBe(false);
    expect(await row(userId)).toMatchObject({ storageMode: "cloud", storageModeChosenAt: now });
  });

  it("accepts the first choice of a user who already has a preference row", async () => {
    const userId = await createTestUser();
    await db.insert(schema.userPreference).values({ userId, storageMode: "cloud" });

    const accepted = await chooseStorageMode(db, userId, "cloud", now, { onlyIfUnchosen: true });

    expect(accepted).toBe(true);
    expect(await readStorageMode(db, userId)).toMatchObject({ storageMode: "cloud", chosen: true });
  });
});
