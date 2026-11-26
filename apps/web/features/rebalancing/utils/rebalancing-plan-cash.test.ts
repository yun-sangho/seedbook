import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import type { StockPricePoint } from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioAllocation } from "@web/features/portfolio/types/types";
import { computeActualAllocation } from "@web/features/portfolio/utils/compute-actual-allocation";
import {
  computeRebalancingGap,
  portfolioStockValue,
} from "@web/features/portfolio/utils/compute-rebalancing-gap";
import { sumCash } from "@web/features/portfolio/utils/linked-portfolio-status";
import { describe, expect, it } from "vitest";
import type { RebalancingSession } from "../types/types";
import { buildRebalancingTasks } from "./build-rebalancing-tasks";
import { rebalancingCashOutlook } from "./trade-cash-check";

/**
 * 계좌 리밸런싱 화면과 같은 순서로 계산해 시작한 직후의 "남은 매매 다 하면" 예수금을 구한다
 * (`account-rebalancing-mobile.tsx`: 실제 비중 → 이격 → 할 일 → 세션).
 */
function expectedCashRightAfterStart(
  account: InvestmentItem,
  allocations: PortfolioAllocation[],
  prices: Map<string, StockPricePoint>,
  tradable: number
): number {
  const actual = computeActualAllocation([account], prices);
  const cashBalance = sumCash(account);
  const cashDelta = tradable - cashBalance;
  const summary = computeRebalancingGap(
    allocations,
    actual.perStock,
    portfolioStockValue(allocations, actual.perStock),
    cashDelta,
    { cashBalance }
  );
  const session: RebalancingSession = {
    id: "s",
    accountId: account.id,
    accountName: account.accountName,
    portfolioId: "p",
    portfolioName: "p",
    cashDelta,
    tasks: buildRebalancingTasks(summary, prices),
    startedAt: "2026-11-26T00:00:00.000Z",
    completedAt: null,
  };
  return rebalancingCashOutlook(account, session).expected;
}

const price = (close: number): StockPricePoint => ({
  close,
  date: "2026-11-26",
  asOf: "2026-11-26T06:30:00.000Z",
  kind: "close",
});

function allocation(ticker: string, targetPercent: number): PortfolioAllocation {
  return { id: ticker, market: "KOSPI", ticker, name: ticker, currency: "KRW", targetPercent };
}

function holding(ticker: string, quantity: number): StockHolding {
  return { id: ticker, market: "KOSPI", ticker, name: ticker, currency: "KRW", quantity, memo: "" };
}

function account(holdings: StockHolding[], cash: number[]): InvestmentItem {
  return {
    id: "acc",
    accountName: "ISA",
    accountType: "ISA 계좌",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings,
    cashItems: cash.map((amount, i) => ({ id: `c${i}`, label: i ? "CMA" : "예수금", amount })),
    note: "",
    color: "#000",
  };
}

const prices = (entries: Record<string, number>) =>
  new Map(Object.entries(entries).map(([ticker, close]) => [`KOSPI:${ticker}`, price(close)]));

describe("expected cash right after starting a rebalancing", () => {
  it("does not go below zero when every buy rounds up (cash-only account)", () => {
    // 예수금 1,000,000원을 세 종목에 1/3 씩: 333,333원 ÷ 가격 → 모두 반올림으로 올라간다
    const allocations = [allocation("A", 33.4), allocation("B", 33.3), allocation("C", 33.3)];
    const expected = expectedCashRightAfterStart(
      account([], [1_000_000]),
      allocations,
      prices({ A: 60_000, B: 51_000, C: 39_000 }),
      1_000_000
    );

    expect(expected).toBeGreaterThanOrEqual(0);
  });

  it("does not go below zero when sells round down, across every cash item", () => {
    // 현금 항목 두 개(합 150,000원). A 를 팔아 B·C 를 산다.
    const allocations = [allocation("A", 20), allocation("B", 40), allocation("C", 40)];
    const expected = expectedCashRightAfterStart(
      account([holding("A", 30), holding("B", 3)], [100_000, 50_000]),
      allocations,
      prices({ A: 47_000, B: 81_000, C: 129_000 }),
      150_000
    );

    expect(expected).toBeGreaterThanOrEqual(0);
  });

  it("keeps money set aside out of the buys (tradable less than cash)", () => {
    const allocations = [allocation("A", 50), allocation("B", 50)];
    const expected = expectedCashRightAfterStart(
      account([], [1_000_000]),
      allocations,
      prices({ A: 70_000, B: 90_000 }),
      // 1,000,000원 중 100,000원은 남겨 둔다 → 450,000원씩: A 6.4→6주, B 5→5주
      900_000
    );

    expect(expected).toBeGreaterThanOrEqual(0);
  });

  it("keeps the rounded plan when it fits exactly", () => {
    // 515,000원씩: A 7.36→7주 (490,000원), B 5.72→6주 (540,000원) = 1,030,000원
    const allocations = [allocation("A", 50), allocation("B", 50)];
    const expected = expectedCashRightAfterStart(
      account([], [1_000_000]),
      allocations,
      prices({ A: 70_000, B: 90_000 }),
      1_030_000
    );

    expect(expected).toBe(0);
  });

  it("takes one share off the buy that ends up least short", () => {
    // 500,000원씩: A 7주 (490,000원) + B 6주 (540,000원) = 1,030,000원 > 1,000,000원.
    // A 를 6주로 줄이면 80,000원, B 를 5주로 줄이면 50,000원 덜 산다 → B 5주
    const allocations = [allocation("A", 50), allocation("B", 50)];
    const expected = expectedCashRightAfterStart(
      account([], [1_000_000]),
      allocations,
      prices({ A: 70_000, B: 90_000 }),
      1_000_000
    );

    expect(expected).toBe(1_000_000 - 7 * 70_000 - 5 * 90_000);
  });
});
