import { randomUUID } from "crypto";
import { schema } from "@seedbook/database";
import { investmentTranslator } from "@web/app/api/storage/_translators/investment";
import { portfolioTranslator } from "@web/app/api/storage/_translators/portfolio";
import { applyMutation } from "@web/server/sync/apply-mutation";
import { pullChanges } from "@web/server/sync/pull";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

function holding(id = randomUUID(), quantity = 10) {
  return {
    id,
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    currency: "KRW",
    quantity,
    memo: "",
  };
}

function accountData(overrides: Record<string, unknown> = {}) {
  return {
    accountName: "ISA 계좌 1",
    accountType: "ISA 계좌",
    currency: "KRW",
    initialInvestment: 1_000,
    currentValue: 1_200,
    note: "",
    color: "#3b82f6",
    sellCostPercent: 0.2,
    records: [{ date: "2026-11-01", initialInvestment: 1_000, currentValue: 1_200 }],
    holdings: [holding()],
    cashItems: [{ id: randomUUID(), label: "예수금", amount: 50 }],
    ...overrides,
  };
}

const upsert = (userId: string, id: string, data: unknown) =>
  applyMutation(db, userId, { entity: "investment", op: "upsert", id, data });

async function portfolioIdOf(accountId: string) {
  const [row] = await db
    .select({ portfolioId: schema.investmentAccount.portfolioId })
    .from(schema.investmentAccount)
    .where(eq(schema.investmentAccount.id, accountId));
  return row?.portfolioId ?? null;
}

describe("investment entity sync", () => {
  it("saves an account with records, holdings and cash and pulls them back", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    const data = accountData();

    const result = await upsert(userId, id, data);

    expect(result).toEqual({ status: "ok", version: 1 });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.investment).toEqual([{ id, version: 1, deletedAt: null, data }]);
  });

  it("replaces holdings, cash and records on the next save", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await upsert(userId, id, accountData());
    const kept = holding(randomUUID(), 3);

    await upsert(userId, id, accountData({ holdings: [kept], cashItems: [], records: [] }));

    const { changes } = await pullChanges(db, userId, null);
    expect(changes.investment![0]?.data).toMatchObject({
      holdings: [kept],
      cashItems: [],
      records: [],
    });
  });

  it("does not take over another user's holding that reuses the same id", async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const holdingId = randomUUID();
    await upsert(owner, randomUUID(), accountData({ holdings: [holding(holdingId, 10)] }));

    await upsert(attacker, randomUUID(), accountData({ holdings: [holding(holdingId, 0)] }));

    const [row] = await db
      .select({ quantity: schema.stockHolding.quantity })
      .from(schema.stockHolding)
      .where(eq(schema.stockHolding.id, holdingId));
    expect(row?.quantity).toBe(10);
  });

  it("rejects saving another user's account", async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const id = randomUUID();
    await upsert(owner, id, accountData({ accountName: "owner" }));

    const result = await upsert(attacker, id, accountData({ accountName: "hijacked" }));

    expect(result).toEqual({ status: "rejected", reason: "forbidden" });
  });

  it("tombstones a deleted account and revives it when saved again", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await upsert(userId, id, accountData());
    const { cursor } = await pullChanges(db, userId, null);

    await applyMutation(db, userId, { entity: "investment", op: "delete", id });
    const afterDelete = await pullChanges(db, userId, cursor);
    await upsert(userId, id, accountData({ accountName: "되살림" }));

    expect(afterDelete.changes.investment).toEqual([
      { id, version: 2, deletedAt: expect.any(String), data: null },
    ]);
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.investment![0]).toMatchObject({ version: 3, data: { accountName: "되살림" } });
  });

  it("links a new account to the portfolio that already lists it", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const portfolioId = randomUUID();
    await portfolioTranslator.write(db, userId, {
      state: {
        portfolios: [
          {
            id: portfolioId,
            name: "안정형",
            color: "#111",
            allocations: [],
            accountIds: [accountId],
            driftThresholdPercent: 5,
            note: "",
          },
        ],
      },
      version: 3,
    });

    await upsert(userId, accountId, accountData());

    expect(await portfolioIdOf(accountId)).toBe(portfolioId);
  });
});

describe("investment envelope translator (mode switching)", () => {
  it("keeps accounts dropped from the envelope as tombstones that pull reports", async () => {
    const userId = await createTestUser();
    const kept = randomUUID();
    const dropped = randomUUID();
    await upsert(userId, kept, accountData({ accountName: "kept" }));
    await upsert(userId, dropped, accountData({ accountName: "dropped" }));
    const { cursor } = await pullChanges(db, userId, null);

    await investmentTranslator.write(db, userId, {
      state: { investments: [{ id: kept, ...accountData({ accountName: "kept" }) }] },
      version: 6,
    });

    const envelope = await investmentTranslator.read(db, userId);
    expect((envelope?.state.investments as Array<{ id: string }>).map((a) => a.id)).toEqual([kept]);
    const { changes } = await pullChanges(db, userId, cursor);
    expect(changes.investment!.find((a) => a.id === dropped)).toMatchObject({
      deletedAt: expect.any(String),
      data: null,
    });
  });
});
