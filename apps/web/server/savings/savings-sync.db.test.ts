import { randomUUID } from "crypto";
import { savingsTranslator } from "@web/app/api/storage/_translators/savings";
import { applyMutation } from "@web/server/sync/apply-mutation";
import { pullChanges } from "@web/server/sync/pull";
import { openTestDb } from "@web/test/db/test-db";
import { afterAll, describe, expect, it } from "vitest";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

function savingsData(accountName = "급여통장", records = [{ date: "2026-11-01", balance: 100 }]) {
  return {
    accountName,
    accountType: "입출금",
    currency: "KRW",
    balance: 100,
    interestRate: null,
    note: "",
    color: "#10b981",
    records,
  };
}

const upsert = (userId: string, id: string, data: unknown) =>
  applyMutation(db, userId, { entity: "savings", op: "upsert", id, data });

describe("savings entity sync", () => {
  it("saves an account with its records and pulls them back (newest record first)", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    const records = [
      { date: "2026-10-01", balance: 50 },
      { date: "2026-11-01", balance: 100 },
    ];

    const result = await upsert(userId, id, savingsData("통장", records));

    expect(result).toEqual({ status: "ok", version: 1 });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.savings).toEqual([
      {
        id,
        version: 1,
        deletedAt: null,
        data: savingsData("통장", [records[1]!, records[0]!]),
      },
    ]);
  });

  it("replaces the record history on the next save", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await upsert(userId, id, savingsData("통장", [{ date: "2026-10-01", balance: 50 }]));

    await upsert(userId, id, savingsData("통장", [{ date: "2026-11-01", balance: 70 }]));

    const { changes } = await pullChanges(db, userId, null);
    expect(changes.savings![0]).toMatchObject({
      version: 2,
      data: { records: [{ date: "2026-11-01", balance: 70 }] },
    });
  });

  it("tombstones a deleted account and revives it when saved again", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await upsert(userId, id, savingsData());
    const { cursor } = await pullChanges(db, userId, null);

    const deleted = await applyMutation(db, userId, { entity: "savings", op: "delete", id });
    const afterDelete = await pullChanges(db, userId, cursor);
    await upsert(userId, id, savingsData("되살림"));

    expect(deleted).toEqual({ status: "ok", version: 2 });
    expect(afterDelete.changes.savings).toEqual([
      { id, version: 2, deletedAt: expect.any(String), data: null },
    ]);
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.savings![0]).toMatchObject({ version: 3, data: { accountName: "되살림" } });
  });

  it("rejects saving another user's account and leaves its records alone", async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const id = randomUUID();
    await upsert(owner, id, savingsData("owner"));

    const result = await upsert(attacker, id, savingsData("hijacked", []));

    expect(result).toEqual({ status: "rejected", reason: "forbidden" });
    const { changes } = await pullChanges(db, owner, null);
    expect(changes.savings![0]?.data).toMatchObject({
      accountName: "owner",
      records: [{ date: "2026-11-01", balance: 100 }],
    });
  });

  it("rejects malformed data", async () => {
    const userId = await createTestUser();

    const result = await upsert(userId, randomUUID(), { ...savingsData(), balance: "lots" });

    expect(result).toEqual({ status: "rejected", reason: "invalid" });
  });
});

describe("savings envelope translator (mode switching)", () => {
  it("keeps accounts dropped from the envelope as tombstones that pull reports", async () => {
    const userId = await createTestUser();
    const kept = randomUUID();
    const dropped = randomUUID();
    await upsert(userId, kept, savingsData("kept"));
    await upsert(userId, dropped, savingsData("dropped"));
    const { cursor } = await pullChanges(db, userId, null);

    await savingsTranslator.write(db, userId, {
      state: { savings: [{ id: kept, ...savingsData("kept") }] },
      version: 3,
    });

    const envelope = await savingsTranslator.read(db, userId);
    expect((envelope?.state.savings as Array<{ id: string }>).map((s) => s.id)).toEqual([kept]);
    const { changes } = await pullChanges(db, userId, cursor);
    expect(changes.savings!.find((s) => s.id === dropped)).toMatchObject({
      deletedAt: expect.any(String),
      data: null,
    });
  });
});
