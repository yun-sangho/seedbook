import { randomUUID } from "node:crypto";
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
        data: {
          ...data,
          goalAmount: null,
          growthStage: 0,
          goalHistory: [],
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
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
    expect((envelope!.state.portfolios as Array<{ id: string }>).map((p) => p.id)).toEqual([kept]);
    const { changes } = await pullChanges(db, userId, cursor);
    expect(changes.portfolio!.find((p) => p.id === dropped)).toMatchObject({
      deletedAt: expect.any(String),
      data: null,
    });
  });

  describe("plant", () => {
    const reached = (amount: number) => ({ amount, reachedAt: "2026-11-20T06:30:00.000Z" });

    async function pulledPortfolio(userId: string) {
      const { changes } = await pullChanges(db, userId, null);
      return changes.portfolio?.[0]?.data as Record<string, unknown> | undefined;
    }

    it("round-trips the goal, stage and reached goals", async () => {
      const userId = await createTestUser();
      const id = randomUUID();
      const plant = { goalAmount: 30_000_000, growthStage: 1, goalHistory: [reached(10_000_000)] };

      await upsert(userId, id, portfolioData(plant));

      expect(await pulledPortfolio(userId)).toMatchObject(plant);
    });

    it("keeps the stored plant when an older client sends none", async () => {
      const userId = await createTestUser();
      const id = randomUUID();
      const plant = { goalAmount: 30_000_000, growthStage: 1, goalHistory: [reached(10_000_000)] };
      await upsert(userId, id, portfolioData(plant));

      await upsert(userId, id, portfolioData({ name: "이름만 바꿈" }));

      expect(await pulledPortfolio(userId)).toMatchObject({ name: "이름만 바꿈", ...plant });
    });

    it("does not let a stale device shrink a plant, but still saves its other changes", async () => {
      const userId = await createTestUser();
      const id = randomUUID();
      const grown = {
        goalAmount: null,
        growthStage: 2,
        goalHistory: [reached(1000), reached(2000)],
      };
      await upsert(userId, id, portfolioData(grown));

      const result = await upsert(
        userId,
        id,
        portfolioData({
          name: "오래된 기기",
          goalAmount: 2000,
          growthStage: 1,
          goalHistory: [reached(1000)],
        })
      );

      // version 을 주지 않아 다음 pull 이 서버의 식물을 다시 내려준다.
      expect(result).toEqual({ status: "ok" });
      expect(await pulledPortfolio(userId)).toMatchObject({ name: "오래된 기기", ...grown });
    });

    it("saves a new goal set at the same stage", async () => {
      const userId = await createTestUser();
      const id = randomUUID();
      await upsert(
        userId,
        id,
        portfolioData({ goalAmount: null, growthStage: 1, goalHistory: [reached(1000)] })
      );

      const result = await upsert(
        userId,
        id,
        portfolioData({ goalAmount: 5000, growthStage: 1, goalHistory: [reached(1000)] })
      );

      expect(result).toEqual({ status: "ok", version: 2 });
      expect(await pulledPortfolio(userId)).toMatchObject({ goalAmount: 5000, growthStage: 1 });
    });

    it("rejects a malformed plant", async () => {
      const userId = await createTestUser();

      const result = await upsert(userId, randomUUID(), portfolioData({ growthStage: 7 }));

      expect(result.status).toBe("rejected");
    });
  });
});
