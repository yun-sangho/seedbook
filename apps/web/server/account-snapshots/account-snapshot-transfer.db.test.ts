import { randomUUID } from "node:crypto";
import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { afterAll, describe, expect, it } from "vitest";
import { type AccountSnapshotPayload, parseSnapshotPayloads } from "./account-snapshot-record";
import { listAccountSnapshots, saveAccountSnapshots } from "./account-snapshot-transfer";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

async function createAccount(userId: string, deleted = false) {
  const id = randomUUID();
  await db.insert(schema.investmentAccount).values({
    id,
    userId,
    accountName: "계좌",
    accountType: "일반",
    currency: "KRW",
    initialInvestment: 0n,
    currentValue: 0n,
    color: "#000000",
    deletedAt: deleted ? new Date() : null,
  });
  return id;
}

function snapshot(accountId: string, date: string, totalValue: number): AccountSnapshotPayload {
  return {
    accountId,
    date,
    stockValue: totalValue + 100,
    cashValue: -100,
    totalValue,
    holdingCount: 1,
    missingPriceCount: 0,
    oldestPriceDate: date,
  };
}

describe("account snapshot transfer", () => {
  it("round-trips the device snapshots of the user's accounts, including deleted ones", async () => {
    const userId = await createTestUser();
    const live = await createAccount(userId);
    const deleted = await createAccount(userId, true);

    const saved = await saveAccountSnapshots(db, userId, [
      snapshot(live, "2026-11-25", 1_000),
      snapshot(live, "2026-11-24", 900),
      snapshot(deleted, "2026-11-24", 5),
    ]);

    expect(saved).toBe(3);
    expect(await listAccountSnapshots(db, userId)).toEqual(
      [
        snapshot(live, "2026-11-24", 900),
        snapshot(deleted, "2026-11-24", 5),
        snapshot(live, "2026-11-25", 1_000),
      ].sort((a, b) => a.date.localeCompare(b.date) || a.accountId.localeCompare(b.accountId))
    );
  });

  it("overwrites the same account and day — the device wins on a mode switch", async () => {
    const userId = await createTestUser();
    const account = await createAccount(userId);
    await saveAccountSnapshots(db, userId, [snapshot(account, "2026-11-25", 1)]);

    await saveAccountSnapshots(db, userId, [snapshot(account, "2026-11-25", 2)]);

    expect((await listAccountSnapshots(db, userId)).map((s) => s.totalValue)).toEqual([2]);
  });

  it("skips accounts the server does not have or that belong to someone else", async () => {
    const userId = await createTestUser();
    const other = await createTestUser();
    const othersAccount = await createAccount(other);

    const saved = await saveAccountSnapshots(db, userId, [
      snapshot(randomUUID(), "2026-11-25", 1),
      snapshot(othersAccount, "2026-11-25", 1),
    ]);

    expect(saved).toBe(0);
    expect(await listAccountSnapshots(db, other)).toEqual([]);
  });
});

describe("parseSnapshotPayloads", () => {
  it("drops malformed snapshots and rejects non-arrays", () => {
    const ok = snapshot(randomUUID(), "2026-11-25", 1);

    expect(parseSnapshotPayloads({})).toBe(null);
    expect(
      parseSnapshotPayloads([
        ok,
        { ...ok, accountId: "not-a-uuid" },
        { ...ok, date: "2026-02-30" },
        { ...ok, totalValue: 1.5 },
        { ...ok, holdingCount: -1 },
        { ...ok, oldestPriceDate: "x" },
        { ...ok, oldestPriceDate: null },
      ])
    ).toEqual([ok, { ...ok, oldestPriceDate: null }]);
  });
});
