import { randomUUID } from "crypto";
import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { assetPlanTranslator } from "./asset-plan";
import { debtsTranslator } from "./debts";
import { investmentTranslator } from "./investment";
import { portfolioTranslator } from "./portfolio";
import { progressTranslator } from "./progress";
import { realAssetsTranslator } from "./real-assets";
import { savingsTranslator } from "./savings";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

function investmentAccount(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    accountName: `계좌 ${id.slice(0, 4)}`,
    accountType: "ISA 계좌",
    currency: "KRW",
    initialInvestment: 1_000_000,
    currentValue: 1_200_000,
    note: "",
    color: "#3b82f6",
    records: [{ date: "2026-11-01", initialInvestment: 1_000_000, currentValue: 1_200_000 }],
    holdings: [
      {
        id: randomUUID(),
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        quantity: 10,
        memo: "",
      },
    ],
    cashItems: [{ id: randomUUID(), label: "예수금", amount: 50_000 }],
    ...overrides,
  };
}

function portfolio(id: string, accountIds: string[], updatedAt = "2026-11-01T00:00:00.000Z") {
  return {
    id,
    name: `포트폴리오 ${id.slice(0, 4)}`,
    description: "",
    color: "#111111",
    allocations: [
      {
        id: randomUUID(),
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        targetPercent: 100,
      },
    ],
    accountIds,
    driftThresholdPercent: 5,
    note: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt,
  };
}

describe("translator round-trip (Drizzle, real Postgres)", () => {
  it("investment: write then read returns the same accounts with nested rows", async () => {
    const userId = await createTestUser();
    const account = investmentAccount(randomUUID());

    await investmentTranslator.write(db, userId, {
      state: { investments: [account], holdingsSortOption: "value" },
      version: 4,
    });
    const envelope = await investmentTranslator.read(db, userId);

    expect(envelope?.state.holdingsSortOption).toBe("value");
    expect(envelope?.state.investments).toEqual([
      expect.objectContaining({
        id: account.id,
        accountName: account.accountName,
        currentValue: 1_200_000,
        records: account.records,
        holdings: account.holdings,
        cashItems: account.cashItems,
      }),
    ]);
  });

  it("portfolio: write then read returns portfolios with allocations and links", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const p = portfolio(randomUUID(), [accountId]);

    await portfolioTranslator.write(db, userId, { state: { portfolios: [p] }, version: 3 });
    const envelope = await portfolioTranslator.read(db, userId);

    expect(envelope?.state.portfolios).toEqual([
      expect.objectContaining({ id: p.id, accountIds: [accountId], allocations: p.allocations }),
    ]);
  });

  it("savings: write then read returns accounts with records", async () => {
    const userId = await createTestUser();
    const saving = {
      id: randomUUID(),
      accountName: "적금",
      accountType: "적금",
      currency: "KRW",
      balance: 3_000_000,
      interestRate: 3.5,
      note: "",
      color: "#10b981",
      records: [{ date: "2026-11-01", balance: 3_000_000 }],
    };

    await savingsTranslator.write(db, userId, { state: { savings: [saving] }, version: 2 });
    const envelope = await savingsTranslator.read(db, userId);

    expect(envelope?.state.savings).toEqual([
      expect.objectContaining({ id: saving.id, balance: 3_000_000, records: saving.records }),
    ]);
  });

  it("debts: write then read returns debts", async () => {
    const userId = await createTestUser();
    const debt = {
      id: randomUUID(),
      loanName: "전세대출",
      loanType: "전세",
      lender: "은행",
      amount: 100_000_000,
      interestRate: 4.1,
      maturityDate: "2028-01-01",
      monthlyPayment: 350_000,
      note: "",
    };

    await debtsTranslator.write(db, userId, { state: { debts: [debt] }, version: 2 });
    const envelope = await debtsTranslator.read(db, userId);

    expect(envelope?.state.debts).toEqual([
      expect.objectContaining({ id: debt.id, amount: 100_000_000, maturityDate: "2028-01-01" }),
    ]);
  });

  it("real-assets: write then read returns assets", async () => {
    const userId = await createTestUser();
    const asset = {
      id: randomUUID(),
      assetName: "아파트",
      assetType: "부동산",
      currentValue: 500_000_000,
      purchaseValue: 400_000_000,
      purchaseDate: "2020-05-01",
      note: "",
      color: "#f59e0b",
    };

    await realAssetsTranslator.write(db, userId, { state: { realAssets: [asset] }, version: 2 });
    const envelope = await realAssetsTranslator.read(db, userId);

    expect(envelope?.state.realAssets).toEqual([
      expect.objectContaining({ id: asset.id, currentValue: 500_000_000 }),
    ]);
  });

  it("asset-plan: write then read returns plans with per-account items", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const plan = {
      id: randomUUID(),
      planName: "기본 계획",
      planPeriod: 10,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
      accountPlans: {
        [accountId]: {
          contributionAmount: "500000",
          contributionFrequency: "월",
          targetAnnualReturn: "7",
          accountKind: "investment" as const,
        },
      },
      totalMonthlyContribution: 500_000,
      averageTargetReturn: 7,
    };

    await assetPlanTranslator.write(db, userId, { state: { plans: [plan] }, version: 2 });
    const envelope = await assetPlanTranslator.read(db, userId);

    expect(envelope?.state.plans).toEqual([
      expect.objectContaining({ id: plan.id, accountPlans: plan.accountPlans }),
    ]);
  });

  it("progress: write then read returns points in date order", async () => {
    const userId = await createTestUser();
    const point = (date: string, totalAssets: number) => ({
      date,
      totalAssets,
      netAssets: totalAssets,
      investments: totalAssets,
      savings: 0,
      realAssets: 0,
      loans: 0,
    });

    await progressTranslator.write(db, userId, {
      state: { progressPoints: [point("2026-11-02", 2), point("2026-11-01", 1)] },
      version: 1,
    });
    const envelope = await progressTranslator.read(db, userId);

    expect(envelope?.state.progressPoints).toEqual([
      point("2026-11-01", 1),
      point("2026-11-02", 2),
    ]);
  });
});

describe("investment_account.portfolioId sync", () => {
  async function portfolioIdOf(accountId: string) {
    const [row] = await db
      .select({ portfolioId: schema.investmentAccount.portfolioId })
      .from(schema.investmentAccount)
      .where(eq(schema.investmentAccount.id, accountId));
    return row?.portfolioId ?? null;
  }

  it("links the account when the portfolio is written after the account", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const p = portfolio(randomUUID(), [accountId]);

    await investmentTranslator.write(db, userId, {
      state: { investments: [investmentAccount(accountId)] },
      version: 4,
    });
    await portfolioTranslator.write(db, userId, { state: { portfolios: [p] }, version: 3 });

    expect(await portfolioIdOf(accountId)).toBe(p.id);
  });

  it("links the account when the portfolio arrives before the new account", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const p = portfolio(randomUUID(), [accountId]);

    await portfolioTranslator.write(db, userId, { state: { portfolios: [p] }, version: 3 });
    await investmentTranslator.write(db, userId, {
      state: { investments: [investmentAccount(accountId)] },
      version: 4,
    });

    expect(await portfolioIdOf(accountId)).toBe(p.id);
  });

  it("clears the link when the account is removed from the portfolio", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const p = portfolio(randomUUID(), [accountId]);
    await investmentTranslator.write(db, userId, {
      state: { investments: [investmentAccount(accountId)] },
      version: 4,
    });
    await portfolioTranslator.write(db, userId, { state: { portfolios: [p] }, version: 3 });

    await portfolioTranslator.write(db, userId, {
      state: { portfolios: [{ ...p, accountIds: [] }] },
      version: 3,
    });

    expect(await portfolioIdOf(accountId)).toBeNull();
  });

  it("stores a shared account only in the most recently updated portfolio", async () => {
    const userId = await createTestUser();
    const accountId = randomUUID();
    const older = portfolio(randomUUID(), [accountId], "2026-01-01T00:00:00.000Z");
    const newer = portfolio(randomUUID(), [accountId], "2026-02-01T00:00:00.000Z");
    await investmentTranslator.write(db, userId, {
      state: { investments: [investmentAccount(accountId)] },
      version: 4,
    });

    await portfolioTranslator.write(db, userId, {
      state: { portfolios: [older, newer] },
      version: 3,
    });

    expect(await portfolioIdOf(accountId)).toBe(newer.id);
    const envelope = await portfolioTranslator.read(db, userId);
    const portfolios = envelope?.state.portfolios as Array<{ id: string; accountIds: string[] }>;
    expect(portfolios.find((x) => x.id === older.id)?.accountIds).toEqual([]);
  });
});
