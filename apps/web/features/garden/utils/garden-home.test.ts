import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import {
  type StockPricePoint,
  stockPriceKey,
} from "@web/features/investments/utils/use-stock-prices";
import { INITIAL_PLANT_PROGRESS } from "@web/features/portfolio/types/constants";
import type { PortfolioAllocation, PortfolioItem } from "@web/features/portfolio/types/types";
import { portfolioPlantView } from "@web/features/portfolio/utils/portfolio-plant-view";
import type { RebalancingSession } from "@web/features/rebalancing/types/types";
import { describe, expect, it } from "vitest";
import { POT_COLOR_IDS } from "../plant-3d/plant-options";
import {
  gardenFocusIndex,
  gardenFocusReducer,
  gardenFocusSummary,
  gardenHandlesBack,
  gardenPlantOptions,
  gardenRows,
  goalProgressPercent,
  grownSince,
  plantDroop,
  potForPortfolio,
  rebalanceDestination,
} from "./garden-home";

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

const balanced = account("balanced", [holding("A", 50), holding("B", 50)]); // 100,000원
const skewed = account("skewed", [holding("A", 90), holding("B", 10)]); // 100,000원
const skewed2 = account("skewed2", [holding("A", 80), holding("B", 20)]);

function session(partial: Partial<RebalancingSession>): RebalancingSession {
  return {
    id: "s",
    accountId: "skewed",
    accountName: "skewed",
    portfolioId: "p",
    portfolioName: "안정형",
    cashDelta: 0,
    tasks: [],
    startedAt: "2026-11-26T00:00:00.000Z",
    completedAt: null,
    ...partial,
  } as RebalancingSession;
}

describe("potForPortfolio", () => {
  it("gives the same pot to the same portfolio", () => {
    expect(potForPortfolio("abc")).toBe(potForPortfolio("abc"));
  });

  it("only picks known pot colors", () => {
    for (const id of ["a", "b", "c", "portfolio-1", "한글"]) {
      expect(POT_COLOR_IDS).toContain(potForPortfolio(id));
    }
  });
});

describe("plantDroop", () => {
  it("is 0 without a reached goal", () => {
    expect(plantDroop(10, null, true)).toBe(0);
  });

  it("is 0 when the value is at or above the last reached goal", () => {
    expect(plantDroop(1000, 1000, true)).toBe(0);
  });

  it("scales the drop so that 20% below the last goal is full droop", () => {
    expect(plantDroop(950, 1000, true)).toBeCloseTo(0.25);
    expect(plantDroop(800, 1000, true)).toBe(1);
    expect(plantDroop(100, 1000, true)).toBe(1);
  });

  it("does not droop before every price has arrived", () => {
    expect(plantDroop(500, 1000, false)).toBe(0);
  });
});

describe("goalProgressPercent", () => {
  it("is null without a goal", () => {
    expect(goalProgressPercent(100, null)).toBeNull();
  });

  it("floors the percentage of the goal", () => {
    expect(goalProgressPercent(999, 1000)).toBe(99);
    expect(goalProgressPercent(1500, 1000)).toBe(150);
  });
});

describe("gardenPlantOptions", () => {
  it("maps stage, droop, rebalancing and a stable pot", () => {
    const p = portfolio({
      accountIds: ["skewed"],
      growthStage: 2,
      goalAmount: null,
      goalHistory: [
        { amount: 50_000, reachedAt: "x" },
        { amount: 110_000, reachedAt: "y" },
      ],
    });
    const plant = portfolioPlantView(p, [skewed], prices);

    expect(gardenPlantOptions(plant, p)).toEqual({
      stage: "sapling",
      droop: (110_000 - 100_000) / 110_000 / 0.2,
      needsRebalance: true,
      pot: potForPortfolio("p"),
      seed: expect.any(Number),
    });
  });
});

describe("gardenRows", () => {
  it("is empty without portfolios", () => {
    expect(gardenRows([], [], [])).toEqual([]);
  });

  it("maps each plant to a list row", () => {
    const p = portfolio({ accountIds: ["skewed"], goalAmount: 500_000 });
    const plant = portfolioPlantView(p, [skewed], prices);

    expect(gardenRows([plant], [p], [skewed])).toEqual([
      {
        portfolioId: "p",
        name: "안정형",
        stage: 0,
        pot: potForPortfolio("p"),
        value: 100_000,
        needsRebalance: true,
        drooping: false,
        needsGoal: false,
        returnRate: null,
      },
    ]);
  });

  it("shows the return rate of the linked accounts", () => {
    const a = { ...account("a", []), initialInvestment: 1_000_000, currentValue: 1_100_000 };
    const b = { ...account("b", []), initialInvestment: 1_000_000, currentValue: 1_000_000 };
    const other = { ...account("other", []), initialInvestment: 1_000_000, currentValue: 0 };
    const p = portfolio({ accountIds: ["a", "b"] });
    const plant = portfolioPlantView(p, [a, b, other], prices);

    expect(gardenRows([plant], [p], [a, b, other])[0]?.returnRate).toBeCloseTo(5);
  });

  it("has no return rate when the linked accounts have no principal", () => {
    const p = portfolio({ accountIds: ["balanced"] });
    const plant = portfolioPlantView(p, [balanced], prices);

    expect(gardenRows([plant], [p], [balanced])[0]?.returnRate).toBeNull();
  });

  it("has no value for a portfolio without linked accounts", () => {
    const p = portfolio({ accountIds: ["gone"] });
    const plant = portfolioPlantView(p, [balanced], prices);

    const [row] = gardenRows([plant], [p], [balanced]);

    expect(row?.value).toBeNull();
    expect(row?.returnRate).toBeNull();
    expect(row?.needsRebalance).toBe(false);
  });

  it("asks for a goal when the plant has none", () => {
    const p = portfolio({ accountIds: ["balanced"] });
    const plant = portfolioPlantView(p, [balanced], prices);

    expect(gardenRows([plant], [p], [balanced])[0]?.needsGoal).toBe(true);
  });

  it("names a portfolio without a name", () => {
    const p = portfolio({ name: "" });
    const plant = portfolioPlantView(p, [], prices);

    expect(gardenRows([plant], [p], [])[0]?.name).toBe("이름 없는 포트폴리오");
  });
});

describe("gardenFocusSummary", () => {
  it("summarizes the goal and lists target → current weights", () => {
    const p = portfolio({ accountIds: ["skewed"], goalAmount: 400_000 });
    const plant = portfolioPlantView(p, [skewed], prices);

    const summary = gardenFocusSummary(plant, p, [skewed], prices);

    expect(summary.goalPercent).toBe(25);
    expect(summary.remainingToNextStage).toBe(300_000);
    expect(summary.linked).toBe(true);
    expect(summary.stocks.map((s) => [s.ticker, s.targetPercent, s.percent])).toEqual([
      ["A", 50, 90],
      ["B", 50, 10],
    ]);
  });

  it("puts held stocks outside the target after the target stocks", () => {
    const p = portfolio({ accountIds: ["x"], allocations: [allocation("B", 100)] });
    const x = account("x", [holding("A", 90), holding("B", 10)]);
    const plant = portfolioPlantView(p, [x], prices);

    const summary = gardenFocusSummary(plant, p, [x], prices);

    expect(summary.stocks.map((s) => [s.ticker, s.targetPercent])).toEqual([
      ["B", 100],
      ["A", null],
    ]);
  });

  it("shows targets only for an unlinked portfolio", () => {
    const p = portfolio();
    const plant = portfolioPlantView(p, [], prices);

    const summary = gardenFocusSummary(plant, p, [], prices);

    expect(summary.linked).toBe(false);
    expect(summary.goalPercent).toBeNull();
    expect(summary.stocks.map((s) => [s.ticker, s.targetPercent, s.percent])).toEqual([
      ["A", 50, 0],
      ["B", 50, 0],
    ]);
  });
});

describe("gardenFocusReducer", () => {
  it("focuses the picked plant", () => {
    expect(gardenFocusReducer(null, { type: "pick", portfolioId: "a" })).toBe("a");
  });

  it("moves focus from one plant to another", () => {
    expect(gardenFocusReducer("a", { type: "pick", portfolioId: "b" })).toBe("b");
  });

  it("returns to the whole garden on an empty-spot tap", () => {
    expect(gardenFocusReducer("a", { type: "pick", portfolioId: null })).toBeNull();
  });

  it("returns to the whole garden from the list", () => {
    expect(gardenFocusReducer("a", { type: "overview" })).toBeNull();
  });

  it("returns to the whole garden on back", () => {
    expect(gardenFocusReducer("a", { type: "back" })).toBeNull();
  });

  it("drops focus when the focused portfolio is deleted", () => {
    expect(gardenFocusReducer("a", { type: "sync", portfolioIds: ["b"] })).toBeNull();
  });

  it("keeps focus when the focused portfolio still exists", () => {
    expect(gardenFocusReducer("a", { type: "sync", portfolioIds: ["b", "a"] })).toBe("a");
  });
});

describe("gardenHandlesBack", () => {
  it("handles back while a plant is focused", () => {
    expect(gardenHandlesBack("a")).toBe(true);
  });

  it("lets the screen handle back on the whole garden", () => {
    expect(gardenHandlesBack(null)).toBe(false);
  });
});

describe("gardenFocusIndex", () => {
  const plants = [{ portfolioId: "a" }, { portfolioId: "b" }];

  it("is null for the whole garden", () => {
    expect(gardenFocusIndex(null, plants)).toBeNull();
  });

  it("finds the focused plant by portfolio id", () => {
    expect(gardenFocusIndex("b", plants)).toBe(1);
  });

  it("is null for a portfolio that is gone", () => {
    expect(gardenFocusIndex("c", plants)).toBeNull();
  });
});

describe("grownSince", () => {
  const plant = (portfolioId: string, stage: 0 | 1 | 2 | 3 | 4) => ({
    portfolioId,
    name: portfolioId,
    stage,
  });

  it("celebrates nothing on the first look", () => {
    expect(grownSince(null, [plant("a", 2)])).toEqual([]);
  });

  it("finds plants that grew since the last look", () => {
    const before = new Map([
      ["a", 1],
      ["b", 2],
    ]);

    expect(grownSince(before, [plant("a", 2), plant("b", 2)])).toEqual([plant("a", 2)]);
  });

  it("does not celebrate a newly added portfolio", () => {
    expect(grownSince(new Map(), [plant("new", 0)])).toEqual([]);
  });
});

describe("rebalanceDestination", () => {
  it("is null when no linked account needs rebalancing", () => {
    const p = portfolio({ accountIds: ["balanced"] });

    expect(rebalanceDestination(p, [balanced], prices, [])).toBeNull();
  });

  it("opens the account's rebalancing when one account needs it", () => {
    const p = portfolio({ accountIds: ["balanced", "skewed"] });

    expect(rebalanceDestination(p, [balanced, skewed], prices, [])).toEqual({
      screen: "RebalancingDetail",
      id: "skewed",
    });
  });

  it("resumes an in-progress rebalancing of that account", () => {
    const p = portfolio({ accountIds: ["skewed"] });

    expect(rebalanceDestination(p, [skewed], prices, [session({ id: "s1" })])).toEqual({
      screen: "RebalancingSession",
      id: "s1",
    });
  });

  it("ignores a completed rebalancing of that account", () => {
    const p = portfolio({ accountIds: ["skewed"] });
    const done = session({ id: "s1", completedAt: "2026-11-26T01:00:00.000Z" });

    expect(rebalanceDestination(p, [skewed], prices, [done])).toEqual({
      screen: "RebalancingDetail",
      id: "skewed",
    });
  });

  it("lets the user pick when several accounts need it", () => {
    const p = portfolio({ accountIds: ["skewed", "skewed2"] });

    expect(rebalanceDestination(p, [skewed, skewed2], prices, [])).toEqual({
      screen: "RebalancingNew",
    });
  });
});
