import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import type { PortfolioAllocation } from "@web/features/portfolio/types/types";
import { describe, expect, it } from "vitest";
import { computeRebalancingResult, type QuantityChange } from "./rebalancing-result";

function holding(ticker: string, quantity: number): StockHolding {
  return {
    id: `h-${ticker}`,
    market: "KOSPI",
    ticker,
    name: `종목 ${ticker}`,
    currency: "KRW",
    quantity,
    memo: "",
  };
}

function account(holdings: StockHolding[], cash = 0): InvestmentItem {
  return {
    id: "acc",
    accountName: "연금",
    accountType: "연금저축",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings,
    cashItems: cash > 0 ? [{ id: "c", label: "예수금", amount: cash }] : [],
    note: "",
    color: "#000",
  };
}

function allocation(ticker: string, targetPercent: number): PortfolioAllocation {
  return {
    id: `a-${ticker}`,
    market: "KOSPI",
    ticker,
    name: `목표 ${ticker}`,
    currency: "KRW",
    targetPercent,
  };
}

function change(ticker: string, before: number, after: number): QuantityChange {
  return { task: { market: "KOSPI", ticker }, before, after };
}

describe("computeRebalancingResult", () => {
  it("shows each portfolio stock's quantity and share of stocks plus cash", () => {
    const result = computeRebalancingResult(
      account([holding("A", 3), holding("B", 1)], 1_000),
      [allocation("A", 60), allocation("B", 40)],
      new Map([
        ["KOSPI:A", 2_000],
        ["KOSPI:B", 3_000],
      ]),
      []
    );

    // 6,000 + 3,000 + 1,000 = 10,000
    expect(result).toEqual({
      holdings: [
        {
          market: "KOSPI",
          ticker: "A",
          name: "종목 A",
          quantity: 3,
          change: 0,
          percent: 60,
          targetPercent: 60,
        },
        {
          market: "KOSPI",
          ticker: "B",
          name: "종목 B",
          quantity: 1,
          change: 0,
          percent: 30,
          targetPercent: 40,
        },
      ],
      cash: 1_000,
      cashPercent: 10,
    });
  });

  it("records how many shares each trade added or removed", () => {
    const result = computeRebalancingResult(
      account([holding("A", 13), holding("B", 15)]),
      [allocation("A", 50), allocation("B", 50)],
      new Map(),
      [change("A", 10, 13), change("B", 20, 15)]
    );

    expect(result.holdings.map((h) => h.change)).toEqual([3, -5]);
  });

  it("adds up several trades of the same stock", () => {
    const result = computeRebalancingResult(
      account([holding("A", 12)]),
      [allocation("A", 100)],
      new Map(),
      [change("A", 10, 13), change("A", 13, 12)]
    );

    expect(result.holdings[0]?.change).toBe(2);
  });

  it("keeps a target stock the account does not hold as 0 shares and 0%", () => {
    const result = computeRebalancingResult(
      account([holding("A", 1)]),
      [allocation("A", 50), allocation("B", 50)],
      new Map([["KOSPI:A", 1_000]]),
      []
    );

    expect(result.holdings[1]).toMatchObject({ name: "목표 B", quantity: 0, percent: 0 });
  });

  it("leaves out holdings that are not in the portfolio", () => {
    const result = computeRebalancingResult(
      account([holding("A", 1), holding("OUT", 100)]),
      [allocation("A", 100)],
      new Map([
        ["KOSPI:A", 1_000],
        ["KOSPI:OUT", 1_000],
      ]),
      []
    );

    expect(result.holdings.map((h) => h.ticker)).toEqual(["A"]);
    expect(result.holdings[0]?.percent).toBe(100);
  });

  it("lists a stock that appears twice in the portfolio once", () => {
    const result = computeRebalancingResult(
      account([holding("A", 1)]),
      [allocation("A", 50), { ...allocation("A", 50), id: "a-A-2" }],
      new Map([["KOSPI:A", 1_000]]),
      []
    );

    expect(result.holdings).toHaveLength(1);
  });

  it("sums holdings of the same stock split across several rows", () => {
    const result = computeRebalancingResult(
      account([holding("A", 2), { ...holding("A", 3), id: "h-A-2" }]),
      [allocation("A", 100)],
      new Map([["KOSPI:A", 1_000]]),
      []
    );

    expect(result.holdings[0]?.quantity).toBe(5);
  });

  it("gives a held stock without a price a null share, excluded from the total", () => {
    const result = computeRebalancingResult(
      account([holding("A", 1), holding("B", 1)], 1_000),
      [allocation("A", 50), allocation("B", 50)],
      new Map([["KOSPI:A", 1_000]]),
      []
    );

    expect(result.holdings[0]?.percent).toBe(50);
    expect(result.holdings[1]?.percent).toBeNull();
  });

  it("returns null shares when nothing has value", () => {
    const result = computeRebalancingResult(account([]), [allocation("A", 100)], new Map(), []);

    expect(result.holdings[0]?.percent).toBeNull();
    expect(result.cashPercent).toBeNull();
  });

  it("records the account's total cash before the rebalancing when given", () => {
    const result = computeRebalancingResult(
      account([holding("A", 3)], 1_000),
      [allocation("A", 100)],
      new Map([["KOSPI:A", 2_000]]),
      [],
      { cashBefore: 7_000 }
    );

    expect(result).toMatchObject({ cash: 1_000, cashBefore: 7_000 });
  });
});
