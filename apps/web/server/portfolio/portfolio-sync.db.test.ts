import { randomUUID } from "crypto";
import { schema } from "@seedbook/database";
import { portfolioTranslator } from "@web/app/api/storage/_translators/portfolio";
import { applyMutation } from "@web/server/sync/apply-mutation";
import { pullChanges } from "@web/server/sync/pull";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

function allocation(targetPercent = 100) {
  return {
    id: randomUUID(),
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    currency: "KRW",
    targetPercent,
  };
}

function portfolioData(overrides: Record<string, unknown> = {}) {
  return {
    name: "안정형",
    color: "#111111",
    note: "",
    accountIds: [] as string[],
    driftMode: "relative",
    driftThresholdPercent: 5,
    allocations: [allocation()],
    ...overrides,
  };
}

function accountData() {
  return {
    accountName: "ISA",
    accountType: "ISA 계좌",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    note: "",
    color: "#000",
  };
}

const upsert = (userId: string, id: string, data: unknown) =>
  applyMutation(db, userId, { entity: "portfolio", op: "upsert", id, data });

async function portfolioIdOf(accountId: string) {
  const [row] = await db
    .select({ portfolioId: schema.investmentAccount.portfolioId })
    .from(schema.investmentAccount)
    .where(eq(schema.investmentAccount.id, accountId));
  return row?.portfolioId ?? null;
}

describe("portfolio entity sync", () => {
  it("saves a portfolio with its allocations and pulls it back with server timestamps", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    const data = portfolioData();

    const result = await upsert(userId, id, data);

    expect(result).toEqual({ status: "ok", version: 1 });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.portfolio).toEqual([
      {
        id,
        version: 1,
        deletedAt: null,
        data: { ...data, createdAt: expect.any(String), updatedAt: expect.any(String) },
      },
    ]);
  });

  it("stores a portfolio from an older client (no drift mode) as the %p mode", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    const { driftMode: _omitted, ...legacy } = portfolioData();

    await upsert(userId, id, legacy);

    const { changes } = await pullChanges(db, userId, null);
    expect(changes.portfolio?.[0]?.data).toMatchObject({ driftMode: "absolute" });
  });

  it("replaces the allocations on the next save", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await upsert(userId, id, portfolioData());
    const next = [allocation(60), allocation(40)];

    await upsert(userId, id, portfolioData({ allocations: next }));

    const { changes } = await pullChanges(db, userId, null);
    expect(changes.portfolio![0]?.data?.allocations).toEqual(expect.arrayContaining(next));
    expect(changes.portfolio![0]?.data?.allocations).toHaveLength(2);
  });

  it("links the listed accounts and unlinks them when the portfolio is deleted", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "investment",
      op: "upsert",
      id: accountId,
      data: accountData(),
    });

    await upsert(userId, id, portfolioData({ accountIds: [accountId] }));
    const linked = await portfolioIdOf(accountId);
    await applyMutation(db, userId, { entity: "portfolio", op: "delete", id });

    expect(linked).toBe(id);
    expect(await portfolioIdOf(accountId)).toBeNull();
  });

  it("rejects saving another user's portfolio", async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const id = randomUUID();
    await upsert(owner, id, portfolioData({ name: "owner" }));

    const result = await upsert(attacker, id, portfolioData({ name: "hijacked" }));

    expect(result).toEqual({ status: "rejected", reason: "forbidden" });
  });
});

describe("portfolio envelope translator (mode switching)", () => {
  it("keeps portfolios dropped from the envelope as tombstones that pull reports", async () => {
    const userId = await createTestUser();
    const kept = randomUUID();
    const dropped = randomUUID();
    await upsert(userId, kept, portfolioData({ name: "kept" }));
    await upsert(userId, dropped, portfolioData({ name: "dropped" }));
    const { cursor } = await pullChanges(db, userId, null);

    await portfolioTranslator.write(db, userId, {
      state: { portfolios: [{ id: kept, ...portfolioData({ name: "kept" }) }] },
      version: 3,
    });

    const envelope = await portfolioTranslator.read(db, userId);
    expect((envelope?.state.portfolios as Array<{ id: string }>).map((p) => p.id)).toEqual([kept]);
    const { changes } = await pullChanges(db, userId, cursor);
    expect(changes.portfolio!.find((p) => p.id === dropped)).toMatchObject({
      deletedAt: expect.any(String),
      data: null,
    });
  });
});
