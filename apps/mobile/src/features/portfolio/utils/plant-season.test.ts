import { harvestId, PLANT_WISH_HISTORY_MAX } from "@seedbook/domain";
import { describe, expect, it } from "vitest";
import { INITIAL_PLANT_PROGRESS } from "../types/constants";
import type { PlantProgress } from "../types/types";
import {
  advancePlant,
  changePlantWish,
  driftDays,
  harvestPlant,
  NEXT_GOAL_ERROR_MESSAGES,
  nextGoalError,
  nextGoalFloor,
  PLANT_NAME_MAX_LENGTH,
  planStageGoals,
  plantNameError,
  plantWilt,
  plantWind,
  seasonGoalPercent,
  seasonGoalState,
  setSeasonGoal,
  startPlantSeason,
  trackDriftSince,
  WIND_MAX,
  WISH_MAX_LENGTH,
  wishError,
  wishHistoryNewestFirst,
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

  describe("with the season's stage goals", () => {
    const STAGE_GOALS = [110_000, 125_000, 145_000, 170_000, 200_000];
    const planted = progress({ goalAmount: 110_000, stageGoals: STAGE_GOALS });

    it("heads for the next stage goal after growing", () => {
      const grown = advancePlant(planted, evaluation(115_000), NOW);

      expect(grown).toMatchObject({ growthStage: 1, goalAmount: 125_000 });
    });

    it("grows several stages at once when the amount passed them", () => {
      const grown = advancePlant(planted, evaluation(150_000), NOW);

      expect(grown).toMatchObject({
        growthStage: 3,
        goalAmount: 170_000,
        goalHistory: [
          { amount: 110_000, reachedAt: NOW },
          { amount: 125_000, reachedAt: NOW },
          { amount: 145_000, reachedAt: NOW },
        ],
      });
    });

    it("bears fruit when the final goal is reached", () => {
      const grown = advancePlant(planted, evaluation(200_000), NOW);

      expect(grown).toMatchObject({
        growthStage: 4,
        goalAmount: null,
        fruitGoal: { amount: 200_000, reachedAt: NOW },
      });
    });

    it("picks up the next stage goal an older app cleared after growing", () => {
      const cleared = progress({
        growthStage: 1,
        goalHistory: [reached(110_000)],
        goalAmount: null,
        stageGoals: STAGE_GOALS,
      });

      expect(advancePlant(cleared, evaluation(100_000), NOW).goalAmount).toBe(125_000);
    });
  });
});

describe("planStageGoals", () => {
  it("spreads the steps from today's amount to the goal, small first and larger later", () => {
    expect(planStageGoals(progress(), 2_000_000, 1_000_000)).toEqual([
      1_100_000, 1_250_000, 1_450_000, 1_700_000, 2_000_000,
    ]);
  });

  it("keeps the goals already reached and spreads only the rest", () => {
    const grown = progress({
      growthStage: 2,
      goalHistory: [reached(1_100_000), reached(1_250_000)],
    });

    const goals = planStageGoals(grown, 2_000_000, 1_300_000);

    expect(goals.slice(0, 2)).toEqual([1_100_000, 1_250_000]);
    expect(goals.at(-1)).toBe(2_000_000);
    expect(goals).toHaveLength(5);
    const steps = goals.slice(2).map((g, i, all) => g - (all[i - 1] ?? 1_300_000));
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it("rounds the steps up to 10,000 won", () => {
    const goals = planStageGoals(progress(), 1_234_567, 1_000_000);

    expect(goals.slice(0, 4).every((g) => g % 10_000 === 0)).toBe(true);
    expect(goals.at(-1)).toBe(1_234_567);
  });

  it("never lets a step pass the final goal", () => {
    const goals = planStageGoals(progress(), 15_000, 10_000);

    expect(goals.every((g, i) => g <= 15_000 && g >= (goals[i - 1] ?? 0))).toBe(true);
  });
});

describe("setSeasonGoal", () => {
  it("sets the final goal and heads for the first stage", () => {
    const next = setSeasonGoal(progress(), 2_000_000, 1_000_000);

    expect(next.stageGoals).toEqual([1_100_000, 1_250_000, 1_450_000, 1_700_000, 2_000_000]);
    expect(next.goalAmount).toBe(1_100_000);
  });

  it("remembers the amount the stages start from", () => {
    expect(setSeasonGoal(progress(), 2_000_000, 1_000_000).stageBase).toBe(1_000_000);
  });

  it("clears the goals", () => {
    const next = setSeasonGoal(
      progress({ goalAmount: 5, stageGoals: [1, 2, 3, 4, 5], stageBase: 0 }),
      null,
      0
    );

    expect(next).toMatchObject({ goalAmount: null, stageGoals: [], stageBase: null });
  });
});

describe("seasonGoalPercent", () => {
  it("counts the growth since planting toward the final goal", () => {
    const planted = progress({ stageBase: 1_000_000, stageGoals: [1, 2, 3, 4, 2_000_000] });

    expect(seasonGoalPercent(planted, 1_000_000)).toBe(0);
    expect(seasonGoalPercent(planted, 1_250_000)).toBe(25);
    expect(seasonGoalPercent(planted, 2_500_000)).toBe(100);
    expect(seasonGoalPercent(planted, 900_000)).toBe(0);
  });

  it("measures from zero for a plant set before stages existed", () => {
    expect(seasonGoalPercent(progress({ goalAmount: 1_000_000 }), 750_000)).toBe(75);
  });

  it("is null without a goal", () => {
    expect(seasonGoalPercent(progress(), 750_000)).toBeNull();
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
      plantName: "몽글이",
      wishHistory: [
        { wish: "제주 여행", at: "2026-03-02T00:00:00.000Z" },
        { wish: "부모님과 제주 여행", at: "2026-06-01T00:00:00.000Z" },
      ],
      plantKind: "fern",
      driftSince: KST_TODAY,
    }),
    id: PORTFOLIO_ID,
    name: "안정형",
  };

  it("records the season with its five goals, the wish, the plant name and the wish history", () => {
    const result = harvestPlant(ripe, "tree", NOW);

    expect(result?.harvest).toEqual({
      id: harvestId(PORTFOLIO_ID, 2),
      sourceType: "portfolio",
      sourceId: PORTFOLIO_ID,
      sourceName: "안정형",
      season: 2,
      plantKind: "fern",
      wish: "부모님과 제주 여행",
      plantName: "몽글이",
      wishHistory: [
        { wish: "제주 여행", at: "2026-03-02T00:00:00.000Z" },
        { wish: "부모님과 제주 여행", at: "2026-06-01T00:00:00.000Z" },
      ],
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
      plantName: "",
      wishHistory: [],
      stageGoals: [],
      stageBase: null,
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
  it("sets the plant kind, the plant name and the wish", () => {
    const next = startPlantSeason(
      progress(),
      { plantKind: "fern", plantName: "  몽글이 ", wish: "  여행  " },
      NOW
    );

    expect(next).toMatchObject({ plantKind: "fern", plantName: "몽글이", wish: "여행" });
  });

  it("starts the wish history with the first wish", () => {
    const next = startPlantSeason(
      progress({ wishHistory: [{ wish: "지난 소원", at: "2026-01-01T00:00:00.000Z" }] }),
      { plantKind: "tree", plantName: "", wish: "여행" },
      NOW
    );

    expect(next.wishHistory).toEqual([{ wish: "여행", at: NOW }]);
  });

  it("starts an empty wish history when no wish was written", () => {
    const next = startPlantSeason(
      progress(),
      { plantKind: "tree", plantName: "", wish: "  " },
      NOW
    );

    expect(next.wishHistory).toEqual([]);
  });
});

describe("changePlantWish", () => {
  const planted = progress({
    wish: "여행",
    wishHistory: [{ wish: "여행", at: "2026-11-01T00:00:00.000Z" }],
  });

  it("changes the wish and adds it to the history", () => {
    const next = changePlantWish(planted, "  가족 여행 ", NOW);

    expect(next.wish).toBe("가족 여행");
    expect(next.wishHistory).toEqual([
      { wish: "여행", at: "2026-11-01T00:00:00.000Z" },
      { wish: "가족 여행", at: NOW },
    ]);
  });

  it("records clearing the wish", () => {
    const next = changePlantWish(planted, "", NOW);

    expect(next.wish).toBe("");
    expect(next.wishHistory.at(-1)).toEqual({ wish: "", at: NOW });
  });

  it("leaves the plant as it is when the wish did not change", () => {
    expect(changePlantWish(planted, " 여행 ", NOW)).toBe(planted);
  });

  it("keeps only the most recent wishes", () => {
    const full = progress({
      wish: "소원 19",
      wishHistory: Array.from({ length: PLANT_WISH_HISTORY_MAX }, (_, i) => ({
        wish: `소원 ${i}`,
        at: "2026-11-01T00:00:00.000Z",
      })),
    });

    const next = changePlantWish(full, "새 소원", NOW);

    expect(next.wishHistory).toHaveLength(PLANT_WISH_HISTORY_MAX);
    expect(next.wishHistory[0]?.wish).toBe("소원 1");
    expect(next.wishHistory.at(-1)).toEqual({ wish: "새 소원", at: NOW });
  });

  it("keeps the wish written before the history existed", () => {
    const legacy = progress({ wish: "여행" });

    const next = changePlantWish(legacy, "가족 여행", NOW);

    expect(next.wishHistory).toEqual([
      { wish: "여행", at: null },
      { wish: "가족 여행", at: NOW },
    ]);
  });
});

describe("wishHistoryNewestFirst", () => {
  it("lists the wishes newest first", () => {
    const entries = wishHistoryNewestFirst(
      progress({
        wish: "가족 여행",
        wishHistory: [
          { wish: "여행", at: "2026-11-01T00:00:00.000Z" },
          { wish: "가족 여행", at: NOW },
        ],
      })
    );

    expect(entries.map((e) => e.wish)).toEqual(["가족 여행", "여행"]);
  });

  it("shows a wish written before the history existed without a date", () => {
    expect(wishHistoryNewestFirst(progress({ wish: "여행" }))).toEqual([
      { wish: "여행", at: null },
    ]);
  });

  it("is empty for a plant without a wish", () => {
    expect(wishHistoryNewestFirst(progress())).toEqual([]);
  });
});

describe("plantNameError", () => {
  it("accepts an empty name", () => {
    expect(plantNameError("")).toBeNull();
  });

  it("rejects a name longer than the limit", () => {
    expect(plantNameError("가".repeat(PLANT_NAME_MAX_LENGTH))).toBeNull();
    expect(plantNameError("가".repeat(PLANT_NAME_MAX_LENGTH + 1))).toBe("too-long");
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
