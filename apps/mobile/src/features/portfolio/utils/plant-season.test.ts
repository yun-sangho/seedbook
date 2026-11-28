import { harvestId } from "@seedbook/domain";
import { describe, expect, it } from "vitest";
import { INITIAL_PLANT_PROGRESS } from "../types/constants";
import type { PlantProgress } from "../types/types";
import {
  advancePlant,
  driftDays,
  harvestPlant,
  NEXT_GOAL_ERROR_MESSAGES,
  nextGoalError,
  nextGoalFloor,
  plantWilt,
  plantWind,
  seasonGoalState,
  startPlantSeason,
  trackDriftSince,
  WIND_MAX,
  WISH_MAX_LENGTH,
  wishError,
} from "./plant-season";

const PORTFOLIO_ID = "6a1f8c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const NOW = "2026-11-28T06:30:00.000Z";
/** 2026-11-28 00:00 KST. */
const KST_TODAY = "2026-11-27T15:00:00.000Z";

function progress(partial: Partial<PlantProgress> = {}): PlantProgress {
  return { ...INITIAL_PLANT_PROGRESS, ...partial };
}

const reached = (amount: number) => ({ amount, reachedAt: "2026-11-01T00:00:00.000Z" });
const FOUR_GOALS = [100_000, 200_000, 300_000, 400_000].map(reached);

const evaluation = (
  value: number,
  overrides: { pricesComplete?: boolean; drifting?: boolean } = {}
) => ({
  value,
  pricesComplete: true,
  drifting: false,
  ...overrides,
});

describe("nextGoalFloor", () => {
  it("is 10% above the current value, rounded up to 만원", () => {
    expect(nextGoalFloor(progress(), { value: 1_234_567, pricesComplete: true })).toBe(1_360_000);
  });

  it("is 10% above the last reached goal when the value is lower", () => {
    const p = progress({ growthStage: 1, goalHistory: [reached(2_000_000)] });

    expect(nextGoalFloor(p, { value: 1_000_000, pricesComplete: true })).toBe(2_200_000);
  });

  it("does not round an exact 만원 floor up (no float error)", () => {
    expect(nextGoalFloor(progress(), { value: 1_000_000, pricesComplete: true })).toBe(1_100_000);
  });

  it("is zero for a portfolio with no value and no reached goal", () => {
    expect(nextGoalFloor(progress(), { value: 0, pricesComplete: true })).toBe(0);
  });

  it("is unknown before every price has arrived", () => {
    expect(nextGoalFloor(progress(), { value: 1_000_000, pricesComplete: false })).toBeNull();
  });
});

describe("nextGoalError", () => {
  const valuation = { value: 1_000_000, pricesComplete: true };

  it("accepts a goal at the floor", () => {
    expect(nextGoalError(progress(), 1_100_000, valuation)).toBeNull();
  });

  it("rejects a goal below the floor", () => {
    expect(nextGoalError(progress(), 1_099_999, valuation)).toBe("below-floor");
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects %s", (amount) => {
    expect(nextGoalError(progress(), amount, valuation)).toBe("invalid");
  });

  it("waits for prices before accepting a goal", () => {
    expect(nextGoalError(progress(), 5_000_000, { value: 0, pricesComplete: false })).toBe(
      "prices-loading"
    );
  });

  it("accepts a fruit goal at flowers and fruit", () => {
    const p = progress({ growthStage: 4, goalHistory: FOUR_GOALS });

    expect(nextGoalError(p, 1_100_000, valuation)).toBeNull();
  });

  it("rejects a goal while the fruit is ripe", () => {
    const p = progress({ growthStage: 4, goalHistory: FOUR_GOALS, fruitGoal: reached(500_000) });

    expect(nextGoalError(p, 5_000_000, valuation)).toBe("ripe");
  });

  it("explains the floor in 만원", () => {
    expect(NEXT_GOAL_ERROR_MESSAGES["below-floor"](1_100_000)).toBe(
      "목표는 110만원 이상이어야 해요 (지금보다 10% 이상)"
    );
  });
});

describe("advancePlant", () => {
  it("grows one stage when the goal is reached within the target weights", () => {
    const grown = advancePlant(progress({ goalAmount: 100_000 }), evaluation(100_000), NOW);

    expect(grown).toMatchObject({
      growthStage: 1,
      goalAmount: null,
      goalHistory: [{ amount: 100_000, reachedAt: NOW }],
    });
  });

  it("does not grow while the weights are off target", () => {
    const p = progress({ goalAmount: 100_000 });

    expect(advancePlant(p, evaluation(200_000, { drifting: true }), NOW)).toBe(p);
  });

  it("does not grow before every price has arrived", () => {
    const p = progress({ goalAmount: 100_000 });

    expect(advancePlant(p, evaluation(200_000, { pricesComplete: false }), NOW)).toBe(p);
  });

  it("does not grow below the goal", () => {
    const p = progress({ goalAmount: 100_000 });

    expect(advancePlant(p, evaluation(99_999), NOW)).toBe(p);
  });

  it("stays without a goal", () => {
    const p = progress();

    expect(advancePlant(p, evaluation(1_000_000), NOW)).toBe(p);
  });

  it("bears fruit at the flower stage without changing the stage", () => {
    const p = progress({ growthStage: 4, goalHistory: FOUR_GOALS, goalAmount: 500_000 });

    const ripe = advancePlant(p, evaluation(500_000), NOW);

    expect(ripe).toMatchObject({
      growthStage: 4,
      goalAmount: null,
      goalHistory: FOUR_GOALS,
      fruitGoal: { amount: 500_000, reachedAt: NOW },
    });
  });

  it("keeps a ripe fruit as it is", () => {
    const p = progress({ growthStage: 4, goalHistory: FOUR_GOALS, fruitGoal: reached(500_000) });

    expect(advancePlant(p, evaluation(9_000_000), NOW)).toBe(p);
  });
});

describe("seasonGoalState", () => {
  it("needs a goal for a seed", () => {
    expect(seasonGoalState(progress(), evaluation(0))).toBe("needs-goal");
  });

  it("is set while growing toward the goal", () => {
    expect(seasonGoalState(progress({ goalAmount: 100_000 }), evaluation(50_000))).toBe("set");
  });

  it("is blocked by drift when the goal is reached but the weights are off", () => {
    const state = seasonGoalState(
      progress({ goalAmount: 100_000 }),
      evaluation(100_000, { drifting: true })
    );

    expect(state).toBe("blocked-by-drift");
  });

  it("is set while drifting below the goal", () => {
    const state = seasonGoalState(
      progress({ goalAmount: 100_000 }),
      evaluation(50_000, { drifting: true })
    );

    expect(state).toBe("set");
  });

  it("needs a fruit goal at flowers and fruit", () => {
    const p = progress({ growthStage: 4, goalHistory: FOUR_GOALS });

    expect(seasonGoalState(p, evaluation(0))).toBe("needs-fruit-goal");
  });

  it("is ripe (fruit on the plant) once the fruit goal is reached, even while drifting", () => {
    const p = progress({ growthStage: 4, goalHistory: FOUR_GOALS, fruitGoal: reached(500_000) });

    expect(seasonGoalState(p, evaluation(0, { drifting: true }))).toBe("ripe");
  });
});

describe("trackDriftSince", () => {
  it("starts counting at the start of today (KST) when drift is first seen", () => {
    const next = trackDriftSince(progress(), true, NOW);

    expect(next.driftSince).toBe(KST_TODAY);
  });

  it("keeps the first day while still drifting", () => {
    const p = progress({ driftSince: "2026-11-20T15:00:00.000Z" });

    expect(trackDriftSince(p, true, NOW)).toBe(p);
  });

  it("clears the day once back within target", () => {
    const p = progress({ driftSince: "2026-11-20T15:00:00.000Z" });

    expect(trackDriftSince(p, false, NOW).driftSince).toBeNull();
  });

  it("returns the same progress when within target and not drifting before", () => {
    const p = progress();

    expect(trackDriftSince(p, false, NOW)).toBe(p);
  });
});

describe("driftDays", () => {
  it("is zero without drift", () => {
    expect(driftDays(null, NOW)).toBe(0);
  });

  it("is zero on the first day", () => {
    expect(driftDays(KST_TODAY, NOW)).toBe(0);
  });

  it("counts KST calendar days, including days the app was closed", () => {
    // 11-21 00:00 KST → 11-28 15:30 KST.
    expect(driftDays("2026-11-20T15:00:00.000Z", NOW)).toBe(7);
  });

  it("counts a day once KST midnight passes", () => {
    // 11-27 23:59 KST 에 시작 → 11-28 00:01 KST.
    expect(driftDays("2026-11-27T14:59:00.000Z", "2026-11-27T15:01:00.000Z")).toBe(1);
  });

  it("is zero for an unreadable or future date", () => {
    expect(driftDays("not-a-date", NOW)).toBe(0);
    expect(driftDays("2026-12-01T15:00:00.000Z", NOW)).toBe(0);
  });
});

describe("plantWilt", () => {
  it.each([
    [0, 0],
    [6, 0],
    [7, 0.35],
    [13, 0.35],
    [14, 0.7],
    [27, 0.7],
    [28, 1],
    [400, 1],
  ])("is %s days → %s", (days, wilt) => {
    expect(plantWilt(days)).toBe(wilt);
  });
});

describe("harvestPlant", () => {
  const ripe = {
    ...progress({
      season: 2,
      growthStage: 4,
      goalHistory: FOUR_GOALS,
      fruitGoal: { amount: 500_000, reachedAt: "2026-11-20T00:00:00.000Z" },
      wish: "부모님과 제주 여행",
      plantKind: "fern",
      driftSince: KST_TODAY,
    }),
    id: PORTFOLIO_ID,
    name: "안정형",
  };

  it("records the season with its five goals and the wish", () => {
    const result = harvestPlant(ripe, "tree", NOW);

    expect(result?.harvest).toEqual({
      id: harvestId(PORTFOLIO_ID, 2),
      sourceType: "portfolio",
      sourceId: PORTFOLIO_ID,
      sourceName: "안정형",
      season: 2,
      plantKind: "fern",
      wish: "부모님과 제주 여행",
      goals: [...FOUR_GOALS, { amount: 500_000, reachedAt: "2026-11-20T00:00:00.000Z" }],
      harvestedAt: NOW,
      doneAt: null,
    });
  });

  it("uses the shown kind when the plant kind was never chosen", () => {
    const result = harvestPlant({ ...ripe, plantKind: null }, "tree", NOW);

    expect(result?.harvest.plantKind).toBe("tree");
  });

  it("starts the next season as a seed, keeping the drift day", () => {
    const result = harvestPlant(ripe, "tree", NOW);

    expect(result?.progress).toMatchObject({
      season: 3,
      growthStage: 0,
      goalAmount: null,
      goalHistory: [],
      fruitGoal: null,
      wish: "",
      plantKind: "fern",
      driftSince: KST_TODAY,
      id: PORTFOLIO_ID,
      name: "안정형",
    });
  });

  it("makes the same harvest id for a portfolio whose id is not a UUID", () => {
    const legacy = { ...ripe, id: "legacy-1" };

    const id = harvestPlant(legacy, "tree", NOW)?.harvest.id;

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-/);
    expect(harvestPlant(legacy, "tree", NOW)?.harvest.id).toBe(id);
  });

  it("can harvest right after the fruit goal is reached (no ripening step)", () => {
    const flowers = {
      ...progress({ growthStage: 4, goalHistory: FOUR_GOALS, goalAmount: 500_000 }),
      id: PORTFOLIO_ID,
      name: "안정형",
    };

    const fruit = advancePlant(flowers, evaluation(500_000), NOW);

    expect(harvestPlant(fruit, "tree", NOW)?.harvest.goals).toHaveLength(5);
  });

  it("cannot harvest before the fruit is ripe", () => {
    expect(harvestPlant({ ...ripe, fruitGoal: null }, "tree", NOW)).toBeNull();
  });
});

describe("startPlantSeason", () => {
  it("sets the plant kind and the wish", () => {
    const next = startPlantSeason(progress(), { plantKind: "fern", wish: "  여행  " });

    expect(next).toMatchObject({ plantKind: "fern", wish: "여행" });
  });
});

describe("wishError", () => {
  it("accepts an empty wish", () => {
    expect(wishError("")).toBeNull();
  });

  it("rejects a wish longer than the limit", () => {
    expect(wishError("가".repeat(WISH_MAX_LENGTH))).toBeNull();
    expect(wishError("가".repeat(WISH_MAX_LENGTH + 1))).toBe("too-long");
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
