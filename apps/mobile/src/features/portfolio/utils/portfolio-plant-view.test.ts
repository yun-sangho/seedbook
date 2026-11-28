import { kindForPortfolio } from "@mobile/features/garden/utils/garden-home";
import type { InvestmentItem, StockHolding } from "@mobile/features/investments/types/types";
import {
  type StockPricePoint,
  stockPriceKey,
} from "@mobile/features/investments/utils/use-stock-prices";
import { describe, expect, it } from "vitest";
import { INITIAL_PLANT_PROGRESS } from "../types/constants";
import type { PortfolioAllocation, PortfolioItem } from "../types/types";
import { portfolioPlantView, portfolioRebalancingState } from "./portfolio-plant-view";

function holding(ticker: string, quantity: number): StockHolding {
  return { id: ticker, market: "KOSPI", ticker, name: ticker, currency: "KRW", quantity, memo: "" };
}

function account(id: string, holdings: StockHolding[], cash = 0): InvestmentItem {
  return {
    id,
    accountName: id,
    accountType: "ISA 계좌",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings,
    cashItems: cash !== 0 ? [{ id: `${id}-cash`, label: "예수금", amount: cash }] : [],
    note: "",
    color: "#000",
  };
}

function allocation(ticker: string, targetPercent: number): PortfolioAllocation {
  return { id: ticker, market: "KOSPI", ticker, name: ticker, currency: "KRW", targetPercent };
}

function portfolio(partial: Partial<PortfolioItem> = {}): PortfolioItem {
  return {
    id: "p",
    name: "안정형",
    color: "#111",
    allocations: [allocation("A", 50), allocation("B", 50)],
    accountIds: [],
    driftMode: "absolute",
    driftThresholdPercent: 5,
    ...INITIAL_PLANT_PROGRESS,
    note: "",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

const price = (close: number): StockPricePoint => ({
  close,
  date: "2026-11-26",
  asOf: "2026-11-26T06:30:00.000Z",
  kind: "close",
});
const prices = new Map([
  [stockPriceKey("KOSPI", "A"), price(1000)],
  [stockPriceKey("KOSPI", "B"), price(1000)],
]);

const balanced = account("balanced", [holding("A", 50), holding("B", 50)]);
const skewed = account("skewed", [holding("A", 90), holding("B", 10)]);

describe("portfolioRebalancingState", () => {
  it("is unknown for a portfolio with no linked accounts", () => {
    expect(portfolioRebalancingState(portfolio(), [balanced], prices)).toBe("unknown");
  });

  it("is ok when every linked account is within the threshold", () => {
    const p = portfolio({ accountIds: ["balanced"] });

    expect(portfolioRebalancingState(p, [balanced], prices)).toBe("ok");
  });

  it("needs rebalancing when any linked account drifts past the threshold", () => {
    const p = portfolio({ accountIds: ["balanced", "skewed"] });

    expect(portfolioRebalancingState(p, [balanced, skewed], prices)).toBe("needs-rebalancing");
  });

  it("is unknown when the linked account has nothing to value", () => {
    const p = portfolio({ accountIds: ["empty"] });

    expect(portfolioRebalancingState(p, [account("empty", [])], prices)).toBe("unknown");
  });

  it("skips linked account ids that no longer exist", () => {
    const p = portfolio({ accountIds: ["gone", "balanced"] });

    expect(portfolioRebalancingState(p, [balanced], prices)).toBe("ok");
  });
});

describe("portfolioPlantView", () => {
  const NOW = "2026-11-27T06:30:00.000Z";

  it("combines the portfolio value, plant status and rebalancing state", () => {
    const p = portfolio({ accountIds: ["balanced"], goalAmount: 150_000, wish: "제주 여행" });

    expect(portfolioPlantView(p, [balanced], prices, NOW)).toEqual({
      portfolioId: "p",
      name: "안정형",
      color: "#111",
      kind: kindForPortfolio("p"),
      season: 1,
      plantName: "",
      wish: "제주 여행",
      wishHistory: [],
      value: 100_000,
      pricesComplete: true,
      stage: 0,
      goalState: "set",
      goalAmount: 150_000,
      finalGoalAmount: 150_000,
      remainingToNextStage: 50_000,
      drifting: false,
      driftDays: 0,
      wilt: 0,
      wind: 0,
      ripe: false,
      empty: false,
      changed: false,
      rebalancing: "ok",
    });
  });

  it("shows a seed for a portfolio without accounts or a goal", () => {
    expect(portfolioPlantView(portfolio(), [], prices, NOW)).toMatchObject({
      value: 0,
      stage: 0,
      goalState: "needs-goal",
      drifting: false,
      rebalancing: "unknown",
    });
  });

  it("waits for the weights when a linked account drifts past the threshold", () => {
    const p = portfolio({ accountIds: ["skewed"], goalAmount: 100_000 });

    expect(portfolioPlantView(p, [skewed], prices, NOW)).toMatchObject({
      stage: 0,
      goalState: "blocked-by-drift",
      drifting: true,
      changed: true,
    });
  });

  it("grows on the amount alone when the portfolio has no target weights", () => {
    const p = portfolio({ accountIds: ["skewed"], allocations: [], goalAmount: 100_000 });

    expect(portfolioPlantView(p, [skewed], prices, NOW)).toMatchObject({
      stage: 1,
      drifting: false,
    });
  });

  it("has no wind without linked accounts (no market to drop)", () => {
    const p = portfolio({ growthStage: 1, goalHistory: [{ amount: 100_000, reachedAt: "x" }] });

    expect(portfolioPlantView(p, [], prices, NOW).wind).toBe(0);
  });

  it("uses the plant kind chosen at planting", () => {
    expect(portfolioPlantView(portfolio({ plantKind: "fern" }), [], prices, NOW).kind).toBe("fern");
  });
});
