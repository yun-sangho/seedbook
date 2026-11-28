import type { InvestmentItem, StockHolding } from "@mobile/features/investments/types/types";
import {
  type StockPricePoint,
  stockPriceKey,
} from "@mobile/features/investments/utils/use-stock-prices";
import { describe, expect, it } from "vitest";
import { INITIAL_PLANT_PROGRESS } from "../types/constants";
import type { PlantProgress } from "../types/types";
import { computePlantStatus, evaluatePlant } from "./plant-season";
import {
  computePortfolioValuation,
  furtherPlantProgress,
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

const KST_TODAY = "2026-11-26T15:00:00.000Z"; // 2026-11-27 00:00 KST (NOW 의 KST 날짜)

const evaluation = (value: number, drifting = false, pricesComplete = true) => ({
  value,
  drifting,
  pricesComplete,
});

describe("evaluatePlant", () => {
  it("grows one stage when the goal is reached with the weights on target", () => {
    const evaluated = evaluatePlant(progress({ goalAmount: 10000 }), evaluation(10000), NOW);

    expect(evaluated).toEqual(
      progress({ growthStage: 1, goalHistory: [{ amount: 10000, reachedAt: NOW }] })
    );
  });

  it("does not grow while the weights drift, and starts counting the drift today", () => {
    const evaluated = evaluatePlant(progress({ goalAmount: 10000 }), evaluation(12000, true), NOW);

    expect(evaluated).toEqual(progress({ goalAmount: 10000, driftSince: KST_TODAY }));
  });

  it("forgets the drift once the weights are back on target", () => {
    const p = progress({ goalAmount: 50000, driftSince: "2026-11-01T15:00:00.000Z" });

    expect(evaluatePlant(p, evaluation(1000), NOW).driftSince).toBeNull();
  });

  it("neither grows nor tracks drift before every price has arrived", () => {
    const p = progress({ goalAmount: 100 });

    expect(evaluatePlant(p, evaluation(1000, true, false), NOW)).toBe(p);
  });

  it("returns the same progress when nothing changes", () => {
    const p = progress({ goalAmount: 10000 });

    expect(evaluatePlant(p, evaluation(9999), NOW)).toBe(p);
  });

  it("bears fruit when the fruit goal is reached at flowers", () => {
    const p = progress({ growthStage: 4, goalHistory: [1, 2, 3, 4].map(reached), goalAmount: 500 });

    const evaluated = evaluatePlant(p, evaluation(600), NOW);

    expect(evaluated).toMatchObject({
      growthStage: 4,
      goalAmount: null,
      fruitGoal: { amount: 500, reachedAt: NOW },
    });
  });
});

describe("computePlantStatus", () => {
  it("is a seed that needs a goal when no goal is set", () => {
    expect(computePlantStatus(progress(), evaluation(50000), NOW)).toEqual({
      stage: 0,
      empty: true,
      goalState: "needs-goal",
      goalAmount: null,
      remainingToNextStage: null,
      drifting: false,
      driftDays: 0,
      wilt: 0,
      wind: 0,
      ripe: false,
      changed: false,
    });
  });

  it("is an empty pot until a goal is added, and a seed once it has one", () => {
    expect(computePlantStatus(progress(), evaluation(0), NOW).empty).toBe(true);
    expect(computePlantStatus(progress({ goalAmount: 10000 }), evaluation(0), NOW).empty).toBe(
      false
    );
  });

  it("is not empty after growing, even without the next goal", () => {
    const p = progress({ growthStage: 1, goalHistory: [reached(1)] });

    expect(computePlantStatus(p, evaluation(0), NOW).empty).toBe(false);
  });

  it("reports the amount left to the next stage", () => {
    const status = computePlantStatus(progress({ goalAmount: 10000 }), evaluation(4000), NOW);

    expect(status).toMatchObject({ stage: 0, goalState: "set", remainingToNextStage: 6000 });
  });

  it("grows when the goal is reached and asks for the next goal", () => {
    const status = computePlantStatus(progress({ goalAmount: 10000 }), evaluation(12000), NOW);

    expect(status).toMatchObject({ stage: 1, goalState: "needs-goal", changed: true });
  });

  it("waits for the weights when the goal is reached while drifting", () => {
    const status = computePlantStatus(
      progress({ goalAmount: 10000 }),
      evaluation(12000, true),
      NOW
    );

    expect(status).toMatchObject({
      stage: 0,
      goalState: "blocked-by-drift",
      goalAmount: 10000,
      remainingToNextStage: 0,
      drifting: true,
      changed: true,
    });
  });

  it("wilts by how long the weights have drifted", () => {
    const p = progress({ driftSince: "2026-11-12T15:00:00.000Z" }); // 11-13 KST → 14일

    expect(computePlantStatus(p, evaluation(1000, true), NOW)).toMatchObject({
      driftDays: 14,
      wilt: 0.7,
      changed: false,
    });
  });

  it("does not wilt on the first day a drift is seen", () => {
    const status = computePlantStatus(progress(), evaluation(1000, true), NOW);

    expect(status).toMatchObject({ drifting: true, driftDays: 0, wilt: 0 });
  });

  it("recovers at once when the weights are back on target", () => {
    const p = progress({ driftSince: "2026-10-01T15:00:00.000Z" });

    expect(computePlantStatus(p, evaluation(1000), NOW)).toMatchObject({ wilt: 0, changed: true });
  });

  it("shows a market drop as wind, never as wilting", () => {
    const p = progress({ growthStage: 1, goalHistory: [reached(10000)] });

    const status = computePlantStatus(p, evaluation(8000), NOW);

    expect(status.wind).toBeGreaterThan(0);
    expect(status.wilt).toBe(0);
  });

  it("asks for the fruit goal at flowers", () => {
    const p = progress({ growthStage: 4, goalHistory: [1, 2, 3, 4].map(reached) });

    expect(computePlantStatus(p, evaluation(100), NOW)).toMatchObject({
      stage: 4,
      goalState: "needs-fruit-goal",
      ripe: false,
    });
  });

  it("is ripe once the fruit goal is reached, whatever the weather", () => {
    const p = progress({
      growthStage: 4,
      goalHistory: [1, 2, 3, 4].map(reached),
      fruitGoal: reached(50000),
      driftSince: "2026-10-01T15:00:00.000Z",
    });

    expect(computePlantStatus(p, evaluation(100, true), NOW)).toMatchObject({
      goalState: "ripe",
      ripe: true,
      remainingToNextStage: null,
    });
  });
});

/**
 * 계절 규칙 전환 (#118 → 화면 연결): 배포 전에 저장된 식물은 그대로 읽히고, 새 규칙은 다음 평가부터 적용된다.
 */
describe("plants saved under the old rules", () => {
  it("keeps a fully grown plant at flowers and lets it set a fruit goal", () => {
    const old = readPlantProgress({
      goalAmount: null,
      growthStage: 4,
      goalHistory: [1, 2, 3, 4].map(reached),
    });

    expect(computePlantStatus(old, evaluation(100), NOW)).toMatchObject({
      stage: 4,
      goalState: "needs-fruit-goal",
    });
  });

  it("keeps a goal set before the 10% floor and grows on it", () => {
    const old = readPlantProgress({
      goalAmount: 10001,
      growthStage: 1,
      goalHistory: [reached(10000)],
    });

    expect(evaluatePlant(old, evaluation(10001), NOW).growthStage).toBe(2);
  });

  it("starts wilting only from the first drift seen after the update", () => {
    const old = readPlantProgress({ goalAmount: 10000, growthStage: 0, goalHistory: [] });

    expect(computePlantStatus(old, evaluation(100, true), NOW).wilt).toBe(0);
  });

  it("no longer marks a small drop below the last goal", () => {
    const old = readPlantProgress({ growthStage: 1, goalHistory: [reached(10000)] });

    expect(computePlantStatus(old, evaluation(9600), NOW)).toMatchObject({ wind: 0, wilt: 0 });
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
