import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import type { StockPricePoint } from "@web/features/investments/utils/use-stock-prices";
import { describe, expect, it } from "vitest";
import type { PortfolioAllocation } from "../types/types";
import { portfolioStockRows } from "./portfolio-stock-rows";

function holding(ticker: string, name: string, quantity: number): StockHolding {
  return {
    id: crypto.randomUUID(),
    market: "KOSPI",
    ticker,
    name,
    currency: "KRW",
    quantity,
    memo: "",
  };
}

function account(holdings: StockHolding[]): InvestmentItem {
  return {
    id: crypto.randomUUID(),
    accountName: "계좌",
    accountType: "ISA",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings,
    cashItems: [],
    note: "",
    color: "#000",
  };
}

function allocation(ticker: string, name: string, targetPercent: number): PortfolioAllocation {
  return { id: ticker, market: "KOSPI", ticker, name, currency: "KRW", targetPercent };
}

function price(close: number): StockPricePoint {
  return { close, date: "2026-11-06", asOf: "2026-11-06T06:30:00.000Z", kind: "close" };
}

const PRICES = new Map([
  ["KOSPI:A", price(1_000)],
  ["KOSPI:B", price(2_000)],
  ["KOSPI:C", price(500)],
]);

describe("portfolioStockRows", () => {
  it("sums the same stock across accounts and sorts by value", () => {
    const rows = portfolioStockRows(
      [allocation("A", "에이", 50), allocation("B", "비", 50)],
      [
        account([holding("A", "에이", 10)]),
        account([holding("A", "에이", 10), holding("B", "비", 1)]),
      ],
      PRICES
    );

    expect(rows.map((r) => [r.ticker, r.value])).toEqual([
      ["A", 20_000],
      ["B", 2_000],
    ]);
  });

  it("gives each stock its share of the total stock value and its target", () => {
    const rows = portfolioStockRows(
      [allocation("A", "에이", 70), allocation("B", "비", 30)],
      [account([holding("A", "에이", 3), holding("B", "비", 1)])],
      PRICES
    );

    expect(rows).toEqual([
      expect.objectContaining({ ticker: "A", percent: 60, targetPercent: 70 }),
      expect.objectContaining({ ticker: "B", percent: 40, targetPercent: 30 }),
    ]);
  });

  it("includes a target stock the accounts do not hold, with zero value", () => {
    const rows = portfolioStockRows(
      [allocation("A", "에이", 50), allocation("B", "비", 50)],
      [account([holding("A", "에이", 1)])],
      PRICES
    );

    expect(rows[1]).toMatchObject({ ticker: "B", name: "비", value: 0, percent: 0 });
  });

  it("includes a held stock outside the targets with a null target", () => {
    const rows = portfolioStockRows(
      [allocation("A", "에이", 100)],
      [account([holding("A", "에이", 1), holding("C", "씨", 10)])],
      PRICES
    );

    expect(rows.find((r) => r.ticker === "C")).toMatchObject({
      name: "씨",
      value: 5_000,
      targetPercent: null,
    });
  });
});
