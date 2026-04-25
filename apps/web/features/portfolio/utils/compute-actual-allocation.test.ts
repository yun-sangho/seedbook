import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import type { StockPricePoint } from "@web/features/investments/utils/use-stock-prices";
import { describe, expect, it } from "vitest";
import { computeActualAllocation } from "./compute-actual-allocation";

function makeHolding(overrides: Partial<StockHolding> = {}): StockHolding {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    market: overrides.market ?? "KOSPI",
    ticker: overrides.ticker ?? "005930",
    name: overrides.name ?? "삼성전자",
    currency: overrides.currency ?? "KRW",
    quantity: overrides.quantity ?? 0,
    memo: overrides.memo ?? "",
  };
}

function makeInvestment(holdings: StockHolding[]): InvestmentItem {
  return {
    id: crypto.randomUUID(),
    accountName: "테스트 계좌",
    accountType: "증권계좌",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings,
    cashItems: [],
    note: "",
    color: "#3b82f6",
  };
}

function priceMap(entries: Array<[string, number]>): Map<string, StockPricePoint> {
  return new Map(entries.map(([key, close]) => [key, { close, date: "2024-01-15" }]));
}

describe("computeActualAllocation", () => {
  it("returns empty map and totalStockValue 0 for empty investments", () => {
    const result = computeActualAllocation([], new Map());
    expect(result.totalStockValue).toBe(0);
    expect(result.perStock.size).toBe(0);
  });

  it("computes value and 100% for a single holding with a price", () => {
    const investment = makeInvestment([
      makeHolding({ market: "KOSPI", ticker: "005930", quantity: 10 }),
    ]);
    const prices = priceMap([["KOSPI:005930", 70000]]);
    const result = computeActualAllocation([investment], prices);
    expect(result.totalStockValue).toBe(700000);
    expect(result.perStock.get("KOSPI:005930")).toEqual({ value: 700000, percent: 100 });
  });

  it("skips holdings with no matching price entry", () => {
    const investment = makeInvestment([
      makeHolding({ market: "KOSPI", ticker: "005930", quantity: 10 }),
      makeHolding({ market: "KOSPI", ticker: "000660", quantity: 5 }),
    ]);
    // only one ticker has a price
    const prices = priceMap([["KOSPI:005930", 70000]]);
    const result = computeActualAllocation([investment], prices);
    expect(result.totalStockValue).toBe(700000);
    expect(result.perStock.has("KOSPI:000660")).toBe(false);
  });

  it("sums quantities across multiple accounts holding the same ticker", () => {
    const a = makeInvestment([makeHolding({ market: "KOSPI", ticker: "005930", quantity: 10 })]);
    const b = makeInvestment([makeHolding({ market: "KOSPI", ticker: "005930", quantity: 5 })]);
    const prices = priceMap([["KOSPI:005930", 80000]]);
    const result = computeActualAllocation([a, b], prices);
    expect(result.totalStockValue).toBe(15 * 80000);
    expect(result.perStock.get("KOSPI:005930")).toEqual({
      value: 15 * 80000,
      percent: 100,
    });
  });

  it("computes proportional percentages across multiple stocks", () => {
    const investment = makeInvestment([
      makeHolding({ market: "KOSPI", ticker: "005930", quantity: 10 }), // 700,000
      makeHolding({ market: "KOSPI", ticker: "000660", quantity: 4 }), // 300,000
    ]);
    const prices = priceMap([
      ["KOSPI:005930", 70000],
      ["KOSPI:000660", 75000],
    ]);
    const result = computeActualAllocation([investment], prices);
    expect(result.totalStockValue).toBe(1000000);
    expect(result.perStock.get("KOSPI:005930")).toEqual({ value: 700000, percent: 70 });
    expect(result.perStock.get("KOSPI:000660")).toEqual({ value: 300000, percent: 30 });
  });

  it("ignores legacy holdings with empty market or ticker", () => {
    const investment = makeInvestment([
      makeHolding({ market: "", ticker: "", name: "옛 종목", quantity: 1000 }),
      makeHolding({ market: "KOSPI", ticker: "005930", quantity: 10 }),
    ]);
    const prices = priceMap([["KOSPI:005930", 70000]]);
    const result = computeActualAllocation([investment], prices);
    expect(result.totalStockValue).toBe(700000);
    expect(result.perStock.size).toBe(1);
  });

  it("ignores holdings with quantity 0 or negative", () => {
    const investment = makeInvestment([
      makeHolding({ market: "KOSPI", ticker: "005930", quantity: 0 }),
      makeHolding({ market: "KOSPI", ticker: "000660", quantity: -5 }),
      makeHolding({ market: "KOSDAQ", ticker: "035720", quantity: 3 }),
    ]);
    const prices = priceMap([
      ["KOSPI:005930", 70000],
      ["KOSPI:000660", 75000],
      ["KOSDAQ:035720", 50000],
    ]);
    const result = computeActualAllocation([investment], prices);
    expect(result.totalStockValue).toBe(150000);
    expect(result.perStock.size).toBe(1);
    expect(result.perStock.get("KOSDAQ:035720")?.value).toBe(150000);
  });
});
