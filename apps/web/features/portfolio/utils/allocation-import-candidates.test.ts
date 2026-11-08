import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import {
  stockPriceKey,
  type StockPricePoint,
} from "@web/features/investments/utils/use-stock-prices";
import { describe, expect, it } from "vitest";
import type { PortfolioAllocation, PortfolioItem } from "../types/types";
import { candidatesFromAccount, candidatesFromPortfolio } from "./allocation-import-candidates";

function holding(ticker: string, quantity: number, market = "KOSPI"): StockHolding {
  return {
    id: ticker,
    market,
    ticker,
    name: `${ticker} 이름`,
    currency: "KRW",
    quantity,
    memo: "",
  };
}

function account(holdings: StockHolding[]): InvestmentItem {
  return {
    id: "acc",
    accountName: "acc",
    accountType: "ISA 계좌",
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

function allocation(ticker: string, targetPercent: number, market = "KOSPI"): PortfolioAllocation {
  return { id: ticker, market, ticker, name: `${ticker} 이름`, currency: "KRW", targetPercent };
}

function portfolio(allocations: PortfolioAllocation[]): PortfolioItem {
  return {
    id: "p",
    name: "p",
    color: "#111",
    allocations,
    accountIds: [],
    driftThresholdPercent: 5,
    note: "",
    createdAt: "",
    updatedAt: "",
  };
}

const price = (close: number): StockPricePoint => ({
  close,
  date: "2026-11-06",
  asOf: "2026-11-06T06:30:00.000Z",
  kind: "close",
});

describe("candidatesFromPortfolio", () => {
  it("copies each allocation's stock and target percent", () => {
    const source = portfolio([allocation("A", 60), allocation("B", 40)]);

    const result = candidatesFromPortfolio(source, new Set());

    expect(result).toEqual([
      {
        key: stockPriceKey("KOSPI", "A"),
        stock: { market: "KOSPI", ticker: "A", name: "A 이름", currency: "KRW" },
        targetPercent: 60,
        alreadyAdded: false,
      },
      {
        key: stockPriceKey("KOSPI", "B"),
        stock: { market: "KOSPI", ticker: "B", name: "B 이름", currency: "KRW" },
        targetPercent: 40,
        alreadyAdded: false,
      },
    ]);
  });

  it("marks stocks already in the target portfolio", () => {
    const source = portfolio([allocation("A", 60), allocation("B", 40)]);

    const result = candidatesFromPortfolio(source, new Set([stockPriceKey("KOSPI", "A")]));

    expect(result.map((c) => c.alreadyAdded)).toEqual([true, false]);
  });

  it("skips allocations without a selected stock", () => {
    const source = portfolio([allocation("", 10, ""), allocation("A", 90)]);

    const result = candidatesFromPortfolio(source, new Set());

    expect(result.map((c) => c.stock.ticker)).toEqual(["A"]);
  });
});

describe("candidatesFromAccount", () => {
  it("pre-fills each holding's current weight within the account, rounded to 0.1%", () => {
    // A 1000×1 = 1000, B 1000×2 = 2000 → 33.3% / 66.7%
    const source = account([holding("A", 1), holding("B", 2)]);
    const prices = new Map([
      [stockPriceKey("KOSPI", "A"), price(1000)],
      [stockPriceKey("KOSPI", "B"), price(1000)],
    ]);

    const result = candidatesFromAccount(source, prices, new Set());

    expect(result.map((c) => [c.stock.ticker, c.targetPercent])).toEqual([
      ["A", 33.3],
      ["B", 66.7],
    ]);
  });

  it("uses 0% for a holding without a price", () => {
    const source = account([holding("A", 1), holding("B", 2)]);
    const prices = new Map([[stockPriceKey("KOSPI", "A"), price(1000)]]);

    const result = candidatesFromAccount(source, prices, new Set());

    expect(result.map((c) => [c.stock.ticker, c.targetPercent])).toEqual([
      ["A", 100],
      ["B", 0],
    ]);
  });

  it("skips legacy holdings without market/ticker and zero-quantity holdings", () => {
    const source = account([holding("", 5, ""), holding("Z", 0), holding("A", 1)]);

    const result = candidatesFromAccount(source, new Map(), new Set());

    expect(result.map((c) => c.stock.ticker)).toEqual(["A"]);
  });

  it("marks stocks already in the target portfolio", () => {
    const source = account([holding("A", 1), holding("B", 1)]);

    const result = candidatesFromAccount(source, new Map(), new Set([stockPriceKey("KOSPI", "B")]));

    expect(result.map((c) => c.alreadyAdded)).toEqual([false, true]);
  });
});
