import type { InvestmentItem, StockHolding } from "@mobile/features/investments/types/types";
import {
  type StockPricePoint,
  stockPriceKey,
} from "@mobile/features/investments/utils/use-stock-prices";
import { describe, expect, it } from "vitest";
import { INITIAL_PLANT_PROGRESS } from "../types/constants";
import type { PlantProgress } from "../types/types";
import {
  computePlantStatus,
  computePortfolioValuation,
  furtherPlantProgress,
  growPlant,
  plantGoalError,
  readPlantProgress,
} from "./portfolio-plant";

const NOW = "2026-11-27T06:30:00.000Z";

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

const prices = new Map<string, StockPricePoint>([
  [
    stockPriceKey("KOSPI", "A"),
    { close: 1000, date: "2026-11-26", asOf: "2026-11-26T06:30:00.000Z", kind: "close" },
  ],
]);

function progress(partial: Partial<PlantProgress> = {}): PlantProgress {
  return { ...INITIAL_PLANT_PROGRESS, ...partial };
}

const reached = (amount: number) => ({ amount, reachedAt: "2026-11-01T00:00:00.000Z" });

describe("computePortfolioValuation", () => {
  it("sums stock value and cash of every linked account", () => {
    const investments = [account("a", [holding("A", 10)], 5000), account("b", [], 3000)];

    const valuation = computePortfolioValuation({ accountIds: ["a", "b"] }, investments, prices);

    expect(valuation).toEqual({ value: 18000, pricesComplete: true, accountCount: 2 });
  });

  it("is zero for a portfolio with no linked accounts", () => {
    const valuation = computePortfolioValuation(
      { accountIds: [] },
      [account("a", [], 5000)],
      prices
    );

    expect(valuation).toEqual({ value: 0, pricesComplete: true, accountCount: 0 });
  });

  it("ignores accounts that are not linked", () => {
    const investments = [account("a", [], 1000), account("other", [], 9000)];

    expect(computePortfolioValuation({ accountIds: ["a"] }, investments, prices).value).toBe(1000);
  });

  it("is zero for a linked account with empty holdings", () => {
    const valuation = computePortfolioValuation({ accountIds: ["a"] }, [account("a", [])], prices);

    expect(valuation.value).toBe(0);
  });

  it("counts only cash for a cash-only account", () => {
    const valuation = computePortfolioValuation(
      { accountIds: ["a"] },
      [account("a", [], 7000)],
      prices
    );

    expect(valuation).toEqual({ value: 7000, pricesComplete: true, accountCount: 1 });
  });

  it("leaves out holdings without a price and marks the valuation incomplete", () => {
    const valuation = computePortfolioValuation(
      { accountIds: ["a"] },
      [account("a", [holding("A", 1), holding("NOPRICE", 100)])],
      prices
    );

    expect(valuation).toEqual({ value: 1000, pricesComplete: false, accountCount: 1 });
  });
});

describe("growPlant", () => {
  it("grows one stage, clears the goal and records it when the value reaches the goal", () => {
    const grown = growPlant(progress({ goalAmount: 10000 }), 10000, NOW);

    expect(grown).toEqual(
      progress({
        goalAmount: null,
        growthStage: 1,
        goalHistory: [{ amount: 10000, reachedAt: NOW }],
      })
    );
  });

  it("returns the same progress when the value is below the goal", () => {
    const p = progress({ goalAmount: 10000 });

    expect(growPlant(p, 9999, NOW)).toBe(p);
  });

  it("stays a seed without a goal", () => {
    const p = progress();

    expect(growPlant(p, 1_000_000_000, NOW)).toBe(p);
  });

  it("grows only one stage even when the value is far above the goal", () => {
    expect(growPlant(progress({ goalAmount: 100 }), 1_000_000, NOW).growthStage).toBe(1);
  });

  it("does not grow past flowers and fruit", () => {
    const p = progress({ goalAmount: 100, growthStage: 4 });

    expect(growPlant(p, 1000, NOW)).toBe(p);
  });
});

describe("furtherPlantProgress", () => {
  it("keeps the further-grown progress", () => {
    const local = progress({ goalAmount: 5000, growthStage: 1, goalHistory: [reached(1000)] });
    const server = progress({ growthStage: 2, goalHistory: [reached(1000), reached(3000)] });

    expect(furtherPlantProgress(local, server)).toEqual(server);
  });

  it("prefers the first progress at the same stage", () => {
    const local = progress({ goalAmount: 5000, growthStage: 1, goalHistory: [reached(1000)] });
    const server = progress({ goalAmount: 4000, growthStage: 1, goalHistory: [reached(1000)] });

    expect(furtherPlantProgress(local, server)).toBe(local);
  });

  it("keeps a later season even at a lower stage", () => {
    const local = progress({ growthStage: 4, goalHistory: [1, 2, 3, 4].map(reached) });
    const server = progress({ season: 2, wish: "여행", plantKind: "fern" });

    expect(furtherPlantProgress(local, server)).toEqual(server);
  });

  it("keeps the ripe fruit at the same season and stage", () => {
    const local = progress({ growthStage: 4, goalHistory: [1, 2, 3, 4].map(reached) });
    const server = { ...local, fruitGoal: reached(5) };

    expect(furtherPlantProgress(local, server)).toEqual(server);
  });

  it("keeps its own drift day", () => {
    const local = progress({ driftSince: "2026-11-20T15:00:00.000Z" });
    const server = progress({ growthStage: 1, goalHistory: [reached(1)] });

    expect(furtherPlantProgress(local, server).driftSince).toBe("2026-11-20T15:00:00.000Z");
  });
});

describe("plantGoalError", () => {
  it("accepts a positive whole amount for a seed", () => {
    expect(plantGoalError(progress(), 1_000_000)).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects %s", (amount) => {
    expect(plantGoalError(progress(), amount)).toBe("invalid");
  });

  it("requires the next goal to be above the last reached goal", () => {
    const p = progress({ growthStage: 1, goalHistory: [reached(1000)] });

    expect(plantGoalError(p, 1000)).toBe("not-above-last-goal");
    expect(plantGoalError(p, 1001)).toBeNull();
  });

  it("rejects a goal once the plant is fully grown", () => {
    expect(plantGoalError(progress({ growthStage: 4 }), 1000)).toBe("fully-grown");
  });
});

describe("computePlantStatus", () => {
  const complete = (value: number) => ({ value, pricesComplete: true });

  it("is a seed that needs a goal when no goal is set", () => {
    expect(computePlantStatus(progress(), complete(50000))).toEqual({
      stage: 0,
      drooping: false,
      goalState: "needs-goal",
      goalAmount: null,
      remainingToNextStage: null,
      grew: false,
    });
  });

  it("reports the amount left to the next stage", () => {
    const status = computePlantStatus(progress({ goalAmount: 10000 }), complete(4000));

    expect(status).toMatchObject({ stage: 0, goalState: "set", remainingToNextStage: 6000 });
  });

  it("grows when the goal is reached and asks for the next goal", () => {
    const status = computePlantStatus(progress({ goalAmount: 10000 }), complete(12000));

    expect(status).toMatchObject({
      stage: 1,
      goalState: "needs-goal",
      grew: true,
      drooping: false,
    });
  });

  it("keeps the stage and droops after the value falls below the last reached goal", () => {
    const p = progress({ goalAmount: 20000, growthStage: 1, goalHistory: [reached(10000)] });

    const status = computePlantStatus(p, complete(8000));

    expect(status).toMatchObject({ stage: 1, drooping: true, remainingToNextStage: 12000 });
  });

  it("does not droop at or above the last reached goal", () => {
    const p = progress({ growthStage: 1, goalHistory: [reached(10000)] });

    expect(computePlantStatus(p, complete(10000)).drooping).toBe(false);
  });

  it("does not judge drooping before every price has arrived", () => {
    const p = progress({ growthStage: 1, goalHistory: [reached(10000)] });

    const status = computePlantStatus(p, { value: 0, pricesComplete: false });

    expect(status.drooping).toBe(false);
  });

  it("is complete at flowers and fruit", () => {
    const p = progress({ growthStage: 4, goalHistory: [1, 2, 3, 4].map(reached) });

    expect(computePlantStatus(p, complete(100))).toMatchObject({
      stage: 4,
      goalState: "complete",
      remainingToNextStage: null,
    });
  });
});

describe("readPlantProgress", () => {
  it("defaults to a seed of the first season for a portfolio saved before plants existed", () => {
    expect(readPlantProgress({})).toEqual(INITIAL_PLANT_PROGRESS);
  });

  it("reads saved progress", () => {
    const saved = progress({
      goalAmount: 30000,
      growthStage: 2,
      goalHistory: [reached(1), reached(2)],
      season: 3,
      plantKind: "fern",
      wish: "여행",
      driftSince: "2026-11-20T15:00:00.000Z",
    });

    expect(readPlantProgress(saved)).toEqual(saved);
  });

  it("reads a ripe fruit at flowers and fruit", () => {
    const saved = progress({
      growthStage: 4,
      goalHistory: [1, 2, 3, 4].map(reached),
      fruitGoal: reached(5),
    });

    expect(readPlantProgress(saved)).toEqual(saved);
  });

  it("keeps a plant kind this app does not know (added by a newer app)", () => {
    expect(readPlantProgress({ plantKind: "cactus" }).plantKind).toBe("cactus");
  });

  it("drops broken values", () => {
    expect(
      readPlantProgress({
        goalAmount: -5,
        growthStage: 9,
        goalHistory: [{ amount: "x" }, null],
        season: 0,
        plantKind: 3,
        wish: null,
        fruitGoal: { amount: "x" },
        driftSince: "not-a-date",
      })
    ).toEqual(INITIAL_PLANT_PROGRESS);
  });

  it("clears a goal that does not match the stage (patch from another season)", () => {
    const mixed = { growthStage: 0, goalHistory: [reached(1), reached(2)], goalAmount: 5000 };

    const read = readPlantProgress(mixed);

    expect(read).toMatchObject({ growthStage: 0, goalHistory: [reached(1), reached(2)] });
    expect(read.goalAmount).toBeNull();
  });

  it("clears a fruit before flowers and fruit", () => {
    const read = readPlantProgress({
      growthStage: 1,
      goalHistory: [reached(1)],
      fruitGoal: reached(5),
    });

    expect(read.fruitGoal).toBeNull();
    expect(read.growthStage).toBe(1);
  });

  it("clears a goal next to a ripe fruit", () => {
    const read = readPlantProgress({
      growthStage: 4,
      goalHistory: [1, 2, 3, 4].map(reached),
      fruitGoal: reached(5),
      goalAmount: 9000,
    });

    expect(read.goalAmount).toBeNull();
    expect(read.fruitGoal).toEqual(reached(5));
  });
});
