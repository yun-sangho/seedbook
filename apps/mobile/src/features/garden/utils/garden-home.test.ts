import type { InvestmentItem, StockHolding } from "@mobile/features/investments/types/types";
import {
  type StockPricePoint,
  stockPriceKey,
} from "@mobile/features/investments/utils/use-stock-prices";
import { INITIAL_PLANT_PROGRESS } from "@mobile/features/portfolio/types/constants";
import type { PortfolioAllocation, PortfolioItem } from "@mobile/features/portfolio/types/types";
import { portfolioPlantView } from "@mobile/features/portfolio/utils/portfolio-plant-view";
import type { RebalancingSession } from "@mobile/features/rebalancing/types/types";
import { describe, expect, it } from "vitest";
import { PLANT_KINDS, POT_COLOR_IDS } from "../plant-3d/plant-options";
import {
  gardenFocusIndex,
  gardenFocusReducer,
  gardenHandlesBack,
  gardenPlantOptions,
  gardenRows,
  grownSince,
  kindForPortfolio,
  plantWilt,
  plantWind,
  potForPortfolio,
  WIND_MAX,
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

function _session(partial: Partial<RebalancingSession>): RebalancingSession {
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

describe("kindForPortfolio", () => {
  it("keeps the same kind for the same portfolio", () => {
    expect(kindForPortfolio("abc")).toBe(kindForPortfolio("abc"));
  });

  it("gives both trees and ferns across random portfolio ids", () => {
    const ids = Array.from(
      { length: 40 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
    );
    const kinds = new Set(ids.map(kindForPortfolio));
    expect([...kinds].sort()).toEqual([...PLANT_KINDS].sort());
  });
});

describe("plantWind", () => {
  it("is 0 without a reached goal", () => {
    expect(plantWind(10, null, true)).toBe(0);
  });

  it("is 0 when the value is at or above the last reached goal", () => {
    expect(plantWind(1000, 1000, true)).toBe(0);
    expect(plantWind(1200, 1000, true)).toBe(0);
  });

  it("ignores a drop of 5% or less", () => {
    expect(plantWind(960, 1000, true)).toBe(0);
    expect(plantWind(950, 1000, true)).toBe(0);
  });

  it("grows from 5% to 20% below the last goal, up to half of the old full droop", () => {
    expect(plantWind(875, 1000, true)).toBeCloseTo(0.25);
    expect(plantWind(800, 1000, true)).toBe(WIND_MAX);
    expect(plantWind(100, 1000, true)).toBe(WIND_MAX);
    expect(WIND_MAX).toBe(0.5);
  });

  it("is 0 before every price has arrived", () => {
    expect(plantWind(500, 1000, false)).toBe(0);
  });
});

describe("plantWilt", () => {
  it("is 0 when the weights are on target", () => {
    expect(plantWilt(null)).toBe(0);
  });

  it("does not wilt in the first week of drift (the plant only tilts)", () => {
    expect(plantWilt(0)).toBe(0);
    expect(plantWilt(6)).toBe(0);
  });

  it("wilts in steps at 7, 14 and 28 days of drift", () => {
    expect(plantWilt(7)).toBe(0.35);
    expect(plantWilt(13)).toBe(0.35);
    expect(plantWilt(14)).toBe(0.7);
    expect(plantWilt(27)).toBe(0.7);
    expect(plantWilt(28)).toBe(1);
    expect(plantWilt(400)).toBe(1);
  });

  it("treats a part day as the day it is in", () => {
    expect(plantWilt(6.9)).toBe(0);
    expect(plantWilt(13.5)).toBe(0.35);
  });
});

describe("gardenPlantOptions", () => {
  it("maps stage, wind, rebalancing and a stable pot", () => {
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
      // 마지막 목표보다 9.1% 아래 → (0.091 − 0.05) / 0.15 × 0.5
      wind: expect.closeTo((10_000 / 110_000 - 0.05) / 0.15 / 2, 6),
      // 이탈 기간·열매 목표는 아직 데이터가 없다 (규칙·레코드 태스크가 넣는다).
      wilt: 0,
      ripe: false,
      needsRebalance: true,
      pot: potForPortfolio("p"),
      seed: expect.any(Number),
      kind: kindForPortfolio("p"),
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
        kind: kindForPortfolio("p"),
        value: 100_000,
        needsRebalance: true,
        drooping: false,
        goalState: "set",
        goalAmount: 500_000,
        goalPercent: 20,
        returnRate: null,
      },
    ]);
  });

  it("has no goal progress while the plant waits for a goal", () => {
    const p = portfolio({ accountIds: ["balanced"] });
    const plant = portfolioPlantView(p, [balanced], prices);

    const [row] = gardenRows([plant], [p], [balanced]);

    expect(row?.goalState).toBe("needs-goal");
    expect(row?.goalPercent).toBeNull();
  });

  it("floors the goal progress", () => {
    const p = portfolio({ accountIds: ["balanced"], goalAmount: 300_000 });
    const plant = portfolioPlantView(p, [balanced], prices);

    expect(gardenRows([plant], [p], [balanced])[0]?.goalPercent).toBe(33);
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

  it("names a portfolio without a name", () => {
    const p = portfolio({ name: "" });
    const plant = portfolioPlantView(p, [], prices);

    expect(gardenRows([plant], [p], [])[0]?.name).toBe("이름 없는 포트폴리오");
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
