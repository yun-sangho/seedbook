import { randomUUID } from "crypto";
import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { assetPlanTranslator } from "./asset-plan";
import { debtsTranslator } from "./debts";
import { investmentTranslator } from "./investment";
import { ForeignRowError } from "./ownership";
import { portfolioTranslator } from "./portfolio";
import { realAssetsTranslator } from "./real-assets";
import { savingsTranslator } from "./savings";

/**
 * 다른 사용자의 행 id 를 envelope 에 실어 보내도 그 행을 덮어쓰거나, 그 행에 딸린
 * 하위 데이터를 지우거나 붙일 수 없어야 한다.
 */

const { db, createTestUser, close } = openTestDb();
afterAll(close);

function investmentAccount(id: string, name: string) {
  return {
    id,
    accountName: name,
    accountType: "ISA 계좌",
    currency: "KRW",
    initialInvestment: 1_000_000,
    currentValue: 1_000_000,
    note: "",
    color: "#3b82f6",
    records: [{ date: "2026-11-01", initialInvestment: 1_000_000, currentValue: 1_000_000 }],
    holdings: [] as Array<Record<string, unknown>>,
    cashItems: [] as Array<Record<string, unknown>>,
  };
}

function holding(id: string, quantity: number) {
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

describe("investment translator ownership", () => {
  it("rejects an envelope that reuses another user's account id", async () => {
    const victim = await createTestUser();
    const attacker = await createTestUser();
    const accountId = randomUUID();
    await investmentTranslator.write(db, victim, {
      state: { investments: [investmentAccount(accountId, "victim")] },
      version: 4,
    });

    const attack = investmentTranslator.write(db, attacker, {
      state: { investments: [{ ...investmentAccount(accountId, "hijacked"), records: [] }] },
      version: 4,
    });

    await expect(attack).rejects.toBeInstanceOf(ForeignRowError);
    const envelope = await investmentTranslator.read(db, victim);
    expect(envelope?.state.investments).toEqual([
      expect.objectContaining({ accountName: "victim", records: [expect.anything()] }),
    ]);
  });

  it("does not overwrite another user's holding addressed by id", async () => {
    const victim = await createTestUser();
    const attacker = await createTestUser();
    const holdingId = randomUUID();
    await investmentTranslator.write(db, victim, {
      state: {
        investments: [
          { ...investmentAccount(randomUUID(), "victim"), holdings: [holding(holdingId, 10)] },
        ],
      },
      version: 4,
    });

    await investmentTranslator
      .write(db, attacker, {
        state: {
          investments: [
            { ...investmentAccount(randomUUID(), "mine"), holdings: [holding(holdingId, 0)] },
          ],
        },
        version: 4,
      })
      .catch(() => undefined);

    const [row] = await db
      .select({ quantity: schema.stockHolding.quantity })
      .from(schema.stockHolding)
      .where(eq(schema.stockHolding.id, holdingId));
    expect(row?.quantity).toBe(10);
  });

  it("does not overwrite another user's cash item addressed by id", async () => {
    const victim = await createTestUser();
    const attacker = await createTestUser();
    const cashId = randomUUID();
    await investmentTranslator.write(db, victim, {
      state: {
        investments: [
          {
            ...investmentAccount(randomUUID(), "victim"),
            cashItems: [{ id: cashId, label: "예수금", amount: 100 }],
          },
        ],
      },
      version: 4,
    });

    await investmentTranslator
      .write(db, attacker, {
        state: {
          investments: [
            {
              ...investmentAccount(randomUUID(), "mine"),
              cashItems: [{ id: cashId, label: "hijacked", amount: 0 }],
            },
          ],
        },
        version: 4,
      })
      .catch(() => undefined);

    const [row] = await db
      .select({ label: schema.cashItem.label, amount: schema.cashItem.amount })
      .from(schema.cashItem)
      .where(eq(schema.cashItem.id, cashId));
    expect(row).toEqual({ label: "예수금", amount: 100n });
  });
});

describe("other translators reject another user's row id", () => {
  it("savings", async () => {
    const victim = await createTestUser();
    const attacker = await createTestUser();
    const saving = (name: string) => ({
      id,
      accountName: name,
      accountType: "적금",
      currency: "KRW",
      balance: 1,
      note: "",
      color: "#000",
      records: [{ date: "2026-11-01", balance: 1 }],
    });
    const id = randomUUID();
    await savingsTranslator.write(db, victim, {
      state: { savings: [saving("victim")] },
      version: 2,
    });

    const attack = savingsTranslator.write(db, attacker, {
      state: { savings: [{ ...saving("hijacked"), records: [] }] },
      version: 2,
    });

    await expect(attack).rejects.toBeInstanceOf(ForeignRowError);
    const envelope = await savingsTranslator.read(db, victim);
    expect(envelope?.state.savings).toEqual([
      expect.objectContaining({ accountName: "victim", records: [expect.anything()] }),
    ]);
  });

  it("debts", async () => {
    const victim = await createTestUser();
    const attacker = await createTestUser();
    const id = randomUUID();
    const debt = (loanName: string) => ({
      id,
      loanName,
      loanType: "신용",
      lender: "은행",
      amount: 1,
      interestRate: 1,
      monthlyPayment: 1,
      note: "",
    });
    await debtsTranslator.write(db, victim, { state: { debts: [debt("victim")] }, version: 2 });

    const attack = debtsTranslator.write(db, attacker, {
      state: { debts: [debt("hijacked")] },
      version: 2,
    });

    await expect(attack).rejects.toBeInstanceOf(ForeignRowError);
    const envelope = await debtsTranslator.read(db, victim);
    expect(envelope?.state.debts).toEqual([expect.objectContaining({ loanName: "victim" })]);
  });

  it("real-assets", async () => {
    const victim = await createTestUser();
    const attacker = await createTestUser();
    const id = randomUUID();
    const asset = (assetName: string) => ({
      id,
      assetName,
      assetType: "부동산",
      currentValue: 1,
      purchaseValue: 1,
      note: "",
      color: "#000",
    });
    await realAssetsTranslator.write(db, victim, {
      state: { realAssets: [asset("victim")] },
      version: 2,
    });

    const attack = realAssetsTranslator.write(db, attacker, {
      state: { realAssets: [asset("hijacked")] },
      version: 2,
    });

    await expect(attack).rejects.toBeInstanceOf(ForeignRowError);
    const envelope = await realAssetsTranslator.read(db, victim);
    expect(envelope?.state.realAssets).toEqual([expect.objectContaining({ assetName: "victim" })]);
  });

  it("asset-plan", async () => {
    const victim = await createTestUser();
    const attacker = await createTestUser();
    const id = randomUUID();
    const plan = (planName: string, accountPlans: Record<string, unknown>) => ({
      id,
      planName,
      planPeriod: 10,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      accountPlans,
      totalMonthlyContribution: 1,
      averageTargetReturn: 1,
    });
    const items = {
      [randomUUID()]: {
        contributionAmount: "1",
        contributionFrequency: "월",
        targetAnnualReturn: "1",
        accountKind: "investment",
      },
    };
    await assetPlanTranslator.write(db, victim, {
      state: { plans: [plan("victim", items)] },
      version: 2,
    });

    const attack = assetPlanTranslator.write(db, attacker, {
      state: { plans: [plan("hijacked", {})] },
      version: 2,
    });

    await expect(attack).rejects.toBeInstanceOf(ForeignRowError);
    const envelope = await assetPlanTranslator.read(db, victim);
    expect(envelope?.state.plans).toEqual([
      expect.objectContaining({ planName: "victim", accountPlans: items }),
    ]);
  });

  it("portfolio", async () => {
    const victim = await createTestUser();
    const attacker = await createTestUser();
    const id = randomUUID();
    const p = (name: string, allocations: unknown[]) => ({
      id,
      name,
      color: "#000",
      allocations,
      accountIds: [],
      driftThresholdPercent: 5,
      note: "",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    const allocations = [
      {
        id: randomUUID(),
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        targetPercent: 100,
      },
    ];
    await portfolioTranslator.write(db, victim, {
      state: { portfolios: [p("victim", allocations)] },
      version: 3,
    });

    const attack = portfolioTranslator.write(db, attacker, {
      state: { portfolios: [p("hijacked", [])] },
      version: 3,
    });

    await expect(attack).rejects.toBeInstanceOf(ForeignRowError);
    const envelope = await portfolioTranslator.read(db, victim);
    expect(envelope?.state.portfolios).toEqual([
      expect.objectContaining({ name: "victim", allocations }),
    ]);
  });
});
