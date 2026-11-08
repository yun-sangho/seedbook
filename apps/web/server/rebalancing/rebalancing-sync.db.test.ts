import { randomUUID } from "crypto";
import { rebalancingTranslator } from "@web/app/api/storage/_translators/rebalancing";
import { applyMutation } from "@web/server/sync/apply-mutation";
import { pullChanges } from "@web/server/sync/pull";
import { openTestDb } from "@web/test/db/test-db";
import { afterAll, describe, expect, it } from "vitest";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

function rebalancingData(overrides: Record<string, unknown> = {}) {
  return {
    accountId: randomUUID(),
    accountName: "연금저축",
    portfolioId: randomUUID(),
    portfolioName: "안정형",
    cashDelta: 3_000_000,
    tasks: [
      {
        id: "alloc-1",
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        action: "매도",
        amount: 500_000,
        price: 70_000,
        quantity: 7,
        done: true,
      },
      {
        id: "alloc-2",
        market: "KOSPI",
        ticker: "069500",
        name: "KODEX 200",
        action: "매수",
        amount: 3_500_000,
        price: null,
        quantity: null,
        done: false,
      },
    ],
    startedAt: "2026-11-08T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("applyMutation: rebalancing", () => {
  it("creates a rebalancing and pulls it back with its tasks intact", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    const data = rebalancingData();

    const result = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data,
    });

    expect(result).toEqual({ status: "ok", version: 1 });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.rebalancing).toEqual([{ id, version: 1, deletedAt: null, data }]);
  });

  it("records completion when the last task is checked", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: rebalancingData(),
    });

    const completedAt = "2026-11-09T01:00:00.000Z";
    const result = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: rebalancingData({ completedAt }),
    });

    expect(result).toEqual({ status: "ok", version: 2 });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.rebalancing[0]?.data?.completedAt).toBe(completedAt);
  });

  it("rejects malformed tasks", async () => {
    const userId = await createTestUser();

    const result = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id: randomUUID(),
      data: rebalancingData({ tasks: [{ id: "x", action: "유지" }] }),
    });

    expect(result).toEqual({ status: "rejected", reason: "invalid" });
  });

  it("rejects overwriting another user's rebalancing", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, owner, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: rebalancingData(),
    });

    const result = await applyMutation(db, intruder, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: rebalancingData({ accountName: "hijacked" }),
    });

    expect(result).toEqual({ status: "rejected", reason: "forbidden" });
  });

  it("tombstones a deleted rebalancing so other devices see the delete", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: rebalancingData(),
    });
    const first = await pullChanges(db, userId, null);

    await applyMutation(db, userId, { entity: "rebalancing", op: "delete", id });

    const { changes } = await pullChanges(db, userId, first.cursor);
    expect(changes.rebalancing).toEqual([
      expect.objectContaining({ id, version: 2, data: null, deletedAt: expect.any(String) }),
    ]);
  });

  it("stores the list order for the rebalancings domain", async () => {
    const userId = await createTestUser();

    const result = await applyMutation(db, userId, {
      entity: "listOrder",
      op: "set",
      domain: "rebalancings",
      order: [randomUUID()],
    });

    expect(result).toEqual({ status: "ok" });
  });
});

describe("rebalancing envelope translator", () => {
  it("round-trips sessions in list order", async () => {
    const userId = await createTestUser();
    const a = { id: randomUUID(), ...rebalancingData({ accountName: "a" }) };
    const b = {
      id: randomUUID(),
      ...rebalancingData({ accountName: "b", completedAt: "2026-11-09T00:00:00.000Z" }),
    };

    await rebalancingTranslator.write(db, userId, { state: { sessions: [b, a] }, version: 1 });

    expect(await rebalancingTranslator.read(db, userId)).toEqual({
      state: { sessions: [b, a] },
      version: 1,
    });
  });

  it("tombstones sessions missing from the envelope", async () => {
    const userId = await createTestUser();
    const kept = { id: randomUUID(), ...rebalancingData() };
    const dropped = { id: randomUUID(), ...rebalancingData() };
    await rebalancingTranslator.write(db, userId, {
      state: { sessions: [kept, dropped] },
      version: 1,
    });
    const first = await pullChanges(db, userId, null);

    await rebalancingTranslator.write(db, userId, { state: { sessions: [kept] }, version: 1 });

    const { changes } = await pullChanges(db, userId, first.cursor);
    expect(changes.rebalancing.find((r) => r.id === dropped.id)?.deletedAt).not.toBeNull();
  });
});
