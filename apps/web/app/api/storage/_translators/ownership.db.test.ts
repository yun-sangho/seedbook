import { randomUUID } from "node:crypto";
import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { investmentTranslator } from "./investment";
import { ForeignRowError } from "./ownership";
import { portfolioTranslator } from "./portfolio";

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

describe("portfolio translator ownership", () => {
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
