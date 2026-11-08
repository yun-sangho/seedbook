import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import type { StockPricePoint } from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { describe, expect, it } from "vitest";
import { holdingsOutsidePortfolio } from "./holdings-outside-portfolio";

function holding(ticker: string, quantity: number, name = ticker): StockHolding {
  return { id: `h-${ticker}`, market: "KOSPI", ticker, name, currency: "KRW", quantity, memo: "" };
}

function account(holdings: StockHolding[]): InvestmentItem {
  return {
    id: "acc",
    accountName: "일반",
    accountType: "일반 투자 계좌",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings,
    cashItems: [],
    note: "",
    color: "#000000",
  };
}

const portfolio = {
  allocations: [
    { id: "a", market: "KOSPI", ticker: "AAA", name: "A", currency: "KRW", targetPercent: 50 },
    { id: "b", market: "KOSPI", ticker: "BBB", name: "B", currency: "KRW", targetPercent: 50 },
  ],
} as Pick<PortfolioItem, "allocations">;

const prices = new Map<string, StockPricePoint>([
  [
    "KOSPI:OUT",
    { close: 11_765, date: "2026-11-06", asOf: "2026-11-06T06:30:00.000Z", kind: "close" },
  ],
]);

describe("holdingsOutsidePortfolio", () => {
  it("포트폴리오에 없는 보유 종목을 수량·평가액과 함께 찾는다", () => {
    const result = holdingsOutsidePortfolio(
      account([holding("AAA", 10), holding("OUT", 1_077, "TIGER KRX금현물")]),
      portfolio,
      prices
    );

    expect(result).toEqual([
      { name: "TIGER KRX금현물", ticker: "OUT", quantity: 1_077, value: 1_077 * 11_765 },
    ]);
  });

  it("수량이 0인 종목은 보유한 것이 아니라 빼고 본다", () => {
    expect(holdingsOutsidePortfolio(account([holding("OUT", 0)]), portfolio, prices)).toEqual([]);
  });

  it("같은 종목이 여러 줄이면 합친다", () => {
    const result = holdingsOutsidePortfolio(
      account([holding("OUT", 1_000), { ...holding("OUT", 77), id: "h2" }]),
      portfolio,
      prices
    );

    expect(result).toEqual([
      { name: "OUT", ticker: "OUT", quantity: 1_077, value: 1_077 * 11_765 },
    ]);
  });

  it("시세를 모르면 평가액은 null", () => {
    const result = holdingsOutsidePortfolio(account([holding("NOPRICE", 5)]), portfolio, prices);

    expect(result).toEqual([{ name: "NOPRICE", ticker: "NOPRICE", quantity: 5, value: null }]);
  });

  it("시장·티커가 없는 예전 보유 기록은 판단할 수 없어 빼고 본다", () => {
    const legacy = { ...holding("X", 5), market: "", ticker: "" };

    expect(holdingsOutsidePortfolio(account([legacy]), portfolio, prices)).toEqual([]);
  });

  it("모두 포트폴리오 종목이면 비어 있다", () => {
    expect(
      holdingsOutsidePortfolio(account([holding("AAA", 1), holding("BBB", 1)]), portfolio, prices)
    ).toEqual([]);
  });
});
