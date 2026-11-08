import { describe, expect, it } from "vitest";
import type { CashItem, StockHolding } from "../types/types";
import { computeAccountValuation } from "./compute-account-valuation";
import { stockPriceKey, type StockPricePoint } from "./use-stock-prices";

function holding(partial: Partial<StockHolding>): StockHolding {
  return {
    id: partial.id ?? crypto.randomUUID(),
    market: partial.market ?? "KOSPI",
    ticker: partial.ticker ?? "005930",
    name: partial.name ?? "삼성전자",
    currency: partial.currency ?? "KRW",
    quantity: partial.quantity ?? 0,
    memo: "",
  };
}

function cash(amount: number): CashItem {
  return { id: crypto.randomUUID(), label: "예수금", amount };
}

function prices(entries: Array<[string, string, number, string]>) {
  return new Map<string, StockPricePoint>(
    entries.map(([market, ticker, close, date]) => [stockPriceKey(market, ticker), { close, date }])
  );
}

describe("computeAccountValuation", () => {
  it("returns zero totals for an account with no holdings or cash", () => {
    const result = computeAccountValuation([], [], new Map());

    expect(result).toEqual({
      stocksTotal: 0,
      cashTotal: 0,
      totalValue: 0,
      validHoldingCount: 0,
      allHoldingsHavePrices: true,
      referenceDate: null,
    });
  });

  it("values each holding at close price times quantity", () => {
    const result = computeAccountValuation(
      [holding({ ticker: "005930", quantity: 10 }), holding({ ticker: "000660", quantity: 2 })],
      [],
      prices([
        ["KOSPI", "005930", 70_000, "2026-11-06"],
        ["KOSPI", "000660", 200_000, "2026-11-06"],
      ])
    );

    expect(result.stocksTotal).toBe(1_100_000);
  });

  it("adds cash items to the total value", () => {
    const result = computeAccountValuation(
      [holding({ quantity: 1 })],
      [cash(50_000), cash(25_000)],
      prices([["KOSPI", "005930", 70_000, "2026-11-06"]])
    );

    expect(result.cashTotal).toBe(75_000);
    expect(result.totalValue).toBe(145_000);
  });

  it("excludes legacy holdings without market/ticker from value and count", () => {
    const result = computeAccountValuation(
      [holding({ market: "", ticker: "", quantity: 100 })],
      [],
      new Map()
    );

    expect(result.stocksTotal).toBe(0);
    expect(result.validHoldingCount).toBe(0);
    expect(result.allHoldingsHavePrices).toBe(true);
  });

  it("flags missing prices so callers do not overwrite currentValue with a partial sum", () => {
    const result = computeAccountValuation(
      [holding({ ticker: "005930", quantity: 1 }), holding({ ticker: "000660", quantity: 1 })],
      [],
      prices([["KOSPI", "005930", 70_000, "2026-11-06"]])
    );

    expect(result.allHoldingsHavePrices).toBe(false);
    expect(result.stocksTotal).toBe(70_000);
  });

  it("uses the latest price date as the reference date", () => {
    const result = computeAccountValuation(
      [holding({ ticker: "005930" }), holding({ ticker: "000660" })],
      [],
      prices([
        ["KOSPI", "005930", 1, "2026-11-05"],
        ["KOSPI", "000660", 1, "2026-11-06"],
      ])
    );

    expect(result.referenceDate).toBe("2026-11-06");
  });
});
