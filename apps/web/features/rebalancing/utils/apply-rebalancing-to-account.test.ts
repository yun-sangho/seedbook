import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import { describe, expect, it } from "vitest";
import type { RebalancingSession, RebalancingTask } from "../types/types";
import { applyRebalancingToAccount } from "./apply-rebalancing-to-account";

function task(overrides: Partial<RebalancingTask> = {}): RebalancingTask {
  return {
    id: "alloc-a",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    action: "매수",
    amount: 100_000,
    price: 50_000,
    quantity: 2,
    priceAsOf: null,
    priceKind: null,
    done: true,
    ...overrides,
  };
}

function holding(overrides: Partial<StockHolding> = {}): StockHolding {
  return {
    id: "h1",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    currency: "KRW",
    quantity: 10,
    memo: "",
    ...overrides,
  };
}

function account(overrides: Partial<InvestmentItem> = {}): InvestmentItem {
  return {
    id: "acc",
    accountName: "연금",
    accountType: "연금저축",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings: [holding()],
    cashItems: [{ id: "c1", label: "예수금", amount: 1_000_000 }],
    note: "",
    color: "#000",
    ...overrides,
  };
}

function session(tasks: RebalancingTask[], cashDelta = 0): RebalancingSession {
  return {
    id: "s1",
    accountId: "acc",
    accountName: "연금",
    portfolioId: "p",
    portfolioName: "안정형",
    cashDelta,
    tasks,
    startedAt: "2026-11-01T00:00:00.000Z",
    completedAt: null,
  };
}

const KRW = () => "KRW";

describe("applyRebalancingToAccount", () => {
  it("adds bought shares to the existing holding", () => {
    const { account: result } = applyRebalancingToAccount(account(), session([task()]), KRW);

    expect(result.holdings[0]?.quantity).toBe(12);
  });

  it("subtracts sold shares from the holding", () => {
    const { account: result } = applyRebalancingToAccount(
      account(),
      session([task({ action: "매도", quantity: 3 })]),
      KRW
    );

    expect(result.holdings[0]?.quantity).toBe(7);
  });

  it("keeps a fully sold holding at zero instead of going negative", () => {
    const { account: result } = applyRebalancingToAccount(
      account(),
      session([task({ action: "매도", quantity: 15 })]),
      KRW
    );

    expect(result.holdings[0]?.quantity).toBe(0);
  });

  it("adds a new holding for a stock the account did not hold", () => {
    const { account: result } = applyRebalancingToAccount(
      account(),
      session([task({ id: "alloc-b", ticker: "000660", name: "SK하이닉스", quantity: 1 })]),
      () => "KRW"
    );

    expect(result.holdings[1]).toMatchObject({
      market: "KOSPI",
      ticker: "000660",
      name: "SK하이닉스",
      currency: "KRW",
      quantity: 1,
    });
  });

  it("moves cash by sells minus buys at the snapshot price, plus the cash deposit", () => {
    const { account: result, cashChange } = applyRebalancingToAccount(
      account(),
      session(
        [
          task({ action: "매도", ticker: "005930", quantity: 4, price: 50_000 }),
          task({ id: "alloc-b", action: "매수", ticker: "000660", quantity: 1, price: 150_000 }),
        ],
        300_000
      ),
      KRW
    );

    // +200,000 (매도) - 150,000 (매수) + 300,000 (투입)
    expect(cashChange).toBe(350_000);
    expect(result.cashItems[0]?.amount).toBe(1_350_000);
  });

  it("creates a 예수금 cash item when the account has none", () => {
    const { account: result } = applyRebalancingToAccount(
      account({ cashItems: [] }),
      session([task({ action: "매도", quantity: 1 })]),
      KRW
    );

    expect(result.cashItems).toEqual([
      expect.objectContaining({ label: "예수금", amount: 50_000 }),
    ]);
  });

  it("does not let cash go below zero", () => {
    const { account: result } = applyRebalancingToAccount(
      account({ cashItems: [{ id: "c1", label: "예수금", amount: 10_000 }] }),
      session([task({ quantity: 2, price: 50_000 })]),
      KRW
    );

    expect(result.cashItems[0]?.amount).toBe(0);
  });

  it("skips tasks without a snapshot price and reports them", () => {
    const noPrice = task({ price: null, quantity: null });

    const { account: result, skipped } = applyRebalancingToAccount(
      account(),
      session([noPrice]),
      KRW
    );

    expect(skipped).toEqual([noPrice]);
    expect(result.holdings[0]?.quantity).toBe(10);
    expect(result.cashItems[0]?.amount).toBe(1_000_000);
  });

  it("skips a sell for a stock the account does not hold", () => {
    const sell = task({ action: "매도", ticker: "000660" });

    const { skipped, cashChange } = applyRebalancingToAccount(account(), session([sell]), KRW);

    expect(skipped).toEqual([sell]);
    expect(cashChange).toBe(0);
  });

  it("ignores tasks that are not checked", () => {
    const { account: result } = applyRebalancingToAccount(
      account(),
      session([task({ done: false })]),
      KRW
    );

    expect(result.holdings[0]?.quantity).toBe(10);
  });
});

describe("applyRebalancingToAccount changes", () => {
  it("lists each applied trade with the holding quantity before and after", () => {
    const sell = task({ action: "매도", quantity: 3 });
    const buy = task({ id: "alloc-b", ticker: "000660", name: "SK하이닉스", quantity: 1 });

    const { holdingChanges } = applyRebalancingToAccount(account(), session([sell, buy]), KRW);

    expect(holdingChanges).toEqual([
      { task: sell, before: 10, after: 7 },
      { task: buy, before: 0, after: 1 },
    ]);
  });

  it("reports the cash item balance before and after", () => {
    const { cash } = applyRebalancingToAccount(
      account(),
      session([task({ action: "매도", quantity: 1, price: 50_000 })]),
      KRW
    );

    expect(cash).toEqual({ label: "예수금", before: 1_000_000, after: 1_050_000 });
  });

  it("reports cash from zero when the account has no cash item", () => {
    const { cash } = applyRebalancingToAccount(
      account({ cashItems: [] }),
      session([task({ action: "매도", quantity: 1, price: 50_000 })]),
      KRW
    );

    expect(cash).toEqual({ label: "예수금", before: 0, after: 50_000 });
  });
});
