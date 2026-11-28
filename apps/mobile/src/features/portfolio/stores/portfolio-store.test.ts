import { useHarvestStore } from "@mobile/features/garden/stores/harvest-store";
import { harvestId } from "@seedbook/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DRIFT_MODE,
  DEFAULT_DRIFT_THRESHOLD_PERCENT,
  LEGACY_DRIFT_MODE,
} from "../types/constants";
import type { PortfolioItem } from "../types/types";
import { usePortfolioStore } from "./portfolio-store";

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
// jsdom 의 localStorage 는 getter 라 직접 대입할 수 없다.
vi.stubGlobal("localStorage", localStorageMock);

describe("Portfolio Store", () => {
  beforeEach(() => {
    usePortfolioStore.getState().resetStore();
    useHarvestStore.setState({ harvests: [] });
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("starts with empty portfolios", () => {
      const state = usePortfolioStore.getState();
      expect(state.portfolios).toEqual([]);
    });
  });

  describe("addPortfolio", () => {
    it("creates a portfolio with a unique id and color", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      const state = usePortfolioStore.getState();
      expect(state.portfolios).toHaveLength(1);
      expect(state.portfolios[0]!.id).toBe(id);
      expect(state.portfolios[0]!.color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("uses provided name when given", () => {
      usePortfolioStore.getState().addPortfolio("내 전략");
      expect(usePortfolioStore.getState().portfolios[0]!.name).toBe("내 전략");
    });

    it("names the first unnamed portfolio '포트폴리오 1'", () => {
      usePortfolioStore.getState().addPortfolio();
      expect(usePortfolioStore.getState().portfolios[0]!.name).toBe("포트폴리오 1");
    });

    it("numbers subsequent unnamed portfolios sequentially", () => {
      usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addPortfolio();
      expect(usePortfolioStore.getState().portfolios.map((p) => p.name)).toEqual([
        "포트폴리오 3",
        "포트폴리오 2",
        "포트폴리오 1",
      ]);
    });

    it("does not count custom-named portfolios toward the number", () => {
      usePortfolioStore.getState().addPortfolio("내 전략");
      usePortfolioStore.getState().addPortfolio();
      expect(usePortfolioStore.getState().portfolios[0]!.name).toBe("포트폴리오 1");
    });

    it("reuses the smallest number freed by a deleted portfolio", () => {
      usePortfolioStore.getState().addPortfolio();
      const second = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().removePortfolio(second);
      usePortfolioStore.getState().addPortfolio();
      expect(usePortfolioStore.getState().portfolios[0]!.name).toBe("포트폴리오 2");
    });

    it("assigns different colors to subsequent portfolios", () => {
      usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addPortfolio();
      const colors = usePortfolioStore.getState().portfolios.map((p) => p.color);
      expect(colors[0]).not.toBe(colors[1]);
    });

    it("prepends new portfolios so latest is first", () => {
      usePortfolioStore.getState().addPortfolio("A");
      usePortfolioStore.getState().addPortfolio("B");
      expect(usePortfolioStore.getState().portfolios.map((p) => p.name)).toEqual(["B", "A"]);
    });

    it("initializes accountIds as empty and driftThresholdPercent to default", () => {
      usePortfolioStore.getState().addPortfolio();
      const p = usePortfolioStore.getState().portfolios[0]!;
      expect(p.accountIds).toEqual([]);
      expect(p.driftThresholdPercent).toBe(DEFAULT_DRIFT_THRESHOLD_PERCENT);
    });

    it("measures drift relative to the target by default", () => {
      usePortfolioStore.getState().addPortfolio();
      expect(usePortfolioStore.getState().portfolios[0]!.driftMode).toBe(DEFAULT_DRIFT_MODE);
      expect(DEFAULT_DRIFT_MODE).toBe("relative");
    });
  });

  describe("setDriftMode", () => {
    it("switches how drift is measured", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().setDriftMode(id, "absolute");
      expect(usePortfolioStore.getState().portfolios[0]!.driftMode).toBe("absolute");
    });
  });

  describe("rehydrate", () => {
    it("keeps portfolios saved before drift modes existed on the %p difference", () => {
      // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
      const persistApi = (usePortfolioStore as any).persist;
      const onRehydrate = persistApi.getOptions().onRehydrateStorage() as (state: unknown) => void;
      const state = {
        portfolios: [{ id: "old", name: "old", driftThresholdPercent: 5 } as PortfolioItem],
      };

      onRehydrate(state);

      expect(state.portfolios[0]!.driftMode).toBe(LEGACY_DRIFT_MODE);
      expect(LEGACY_DRIFT_MODE).toBe("absolute");
    });

    it("makes portfolios saved before plants existed a seed without a goal", () => {
      // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
      const persistApi = (usePortfolioStore as any).persist;
      const onRehydrate = persistApi.getOptions().onRehydrateStorage() as (state: unknown) => void;
      const state = { portfolios: [{ id: "old", name: "old" } as PortfolioItem] };

      onRehydrate(state);

      expect(state.portfolios[0]).toMatchObject({
        goalAmount: null,
        growthStage: 0,
        goalHistory: [],
      });
    });
  });

  describe("plant", () => {
    it("starts a new portfolio as a seed without a goal", () => {
      usePortfolioStore.getState().addPortfolio();

      expect(usePortfolioStore.getState().portfolios[0]).toMatchObject({
        goalAmount: null,
        growthStage: 0,
        goalHistory: [],
      });
    });

    const NOW = "2026-11-27T06:30:00.000Z";
    const complete = (value: number) => ({ value, pricesComplete: true });
    const evaluation = (value: number, drifting = false) => ({
      value,
      drifting,
      pricesComplete: true,
    });

    it("sets and clears the goal", () => {
      const id = usePortfolioStore.getState().addPortfolio();

      expect(usePortfolioStore.getState().setPlantGoal(id, 1_000_000, complete(0))).toBe(true);
      expect(usePortfolioStore.getState().portfolios[0]!.goalAmount).toBe(1_000_000);

      usePortfolioStore.getState().setPlantGoal(id, null, complete(0));
      expect(usePortfolioStore.getState().portfolios[0]!.goalAmount).toBeNull();
    });

    it("refuses a goal that breaks the goal rules", () => {
      const id = usePortfolioStore.getState().addPortfolio();

      expect(usePortfolioStore.getState().setPlantGoal(id, 0, complete(0))).toBe(false);
      expect(usePortfolioStore.getState().portfolios[0]!.goalAmount).toBeNull();
    });

    it("refuses a goal less than 10% above the value", () => {
      const id = usePortfolioStore.getState().addPortfolio();

      expect(usePortfolioStore.getState().setPlantGoal(id, 1_090_000, complete(1_000_000))).toBe(
        false
      );
      expect(usePortfolioStore.getState().setPlantGoal(id, 1_100_000, complete(1_000_000))).toBe(
        true
      );
    });

    it("refuses a goal while prices are loading", () => {
      const id = usePortfolioStore.getState().addPortfolio();

      expect(
        usePortfolioStore.getState().setPlantGoal(id, 1000, { value: 0, pricesComplete: false })
      ).toBe(false);
    });

    it("grows the plants whose goal is reached with the weights on target", () => {
      const reachedId = usePortfolioStore.getState().addPortfolio("reached");
      const shortId = usePortfolioStore.getState().addPortfolio("short");
      const driftingId = usePortfolioStore.getState().addPortfolio("drifting");
      for (const id of [reachedId, shortId, driftingId]) {
        usePortfolioStore.getState().setPlantGoal(id, 1000, complete(0));
      }

      usePortfolioStore.getState().evaluatePlants(
        new Map([
          [reachedId, evaluation(1500)],
          [shortId, evaluation(500)],
          [driftingId, evaluation(1500, true)],
        ]),
        NOW
      );

      const byId = new Map(usePortfolioStore.getState().portfolios.map((p) => [p.id, p]));
      expect(byId.get(reachedId)).toMatchObject({ growthStage: 1, goalAmount: null });
      expect(byId.get(reachedId)!.goalHistory.map((g) => g.amount)).toEqual([1000]);
      expect(byId.get(shortId)).toMatchObject({ growthStage: 0, goalAmount: 1000 });
      expect(byId.get(driftingId)).toMatchObject({
        growthStage: 0,
        goalAmount: 1000,
        driftSince: "2026-11-26T15:00:00.000Z",
      });
    });

    it("leaves the state untouched when nothing changes", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().setPlantGoal(id, 1000, complete(0));
      const before = usePortfolioStore.getState().portfolios;

      usePortfolioStore.getState().evaluatePlants(new Map([[id, evaluation(10)]]), NOW);

      expect(usePortfolioStore.getState().portfolios).toBe(before);
    });
  });

  describe("plant seasons", () => {
    const reached = (amount: number) => ({ amount, reachedAt: "2026-11-01T00:00:00.000Z" });
    const ripen = (id: string) => {
      usePortfolioStore.setState((state) => ({
        portfolios: state.portfolios.map((p) =>
          p.id === id
            ? {
                ...p,
                growthStage: 4 as const,
                goalHistory: [1, 2, 3, 4].map(reached),
                fruitGoal: reached(5),
                wish: "제주 여행",
              }
            : p
        ),
      }));
    };

    it("starts a new portfolio in the first season with no wish", () => {
      usePortfolioStore.getState().addPortfolio();

      expect(usePortfolioStore.getState().portfolios[0]).toMatchObject({
        season: 1,
        plantKind: null,
        wish: "",
        fruitGoal: null,
        driftSince: null,
      });
    });

    it("plants a seed with a kind and a wish", () => {
      const id = usePortfolioStore.getState().addPortfolio();

      const ok = usePortfolioStore
        .getState()
        .startPlantSeason(id, { plantKind: "fern", wish: "제주 여행" });

      expect(ok).toBe(true);
      expect(usePortfolioStore.getState().portfolios[0]).toMatchObject({
        plantKind: "fern",
        wish: "제주 여행",
      });
    });

    it("refuses a wish over 100 characters", () => {
      const id = usePortfolioStore.getState().addPortfolio();

      expect(usePortfolioStore.getState().setPlantWish(id, "가".repeat(101))).toBe(false);
      expect(usePortfolioStore.getState().setPlantWish(id, "  여행  ")).toBe(true);
      expect(usePortfolioStore.getState().portfolios[0]!.wish).toBe("여행");
    });

    it("harvests a ripe plant into the basket and starts the next season", () => {
      const id = usePortfolioStore.getState().addPortfolio("안정형");
      ripen(id);

      const harvested = usePortfolioStore.getState().harvestPlant(id);

      expect(harvested).toBe(harvestId(id, 1));
      expect(useHarvestStore.getState().harvests).toEqual([
        expect.objectContaining({
          id: harvestId(id, 1),
          sourceId: id,
          sourceName: "안정형",
          season: 1,
          wish: "제주 여행",
          goals: [1, 2, 3, 4, 5].map(reached),
          doneAt: null,
        }),
      ]);
      expect(usePortfolioStore.getState().portfolios[0]).toMatchObject({
        season: 2,
        growthStage: 0,
        goalHistory: [],
        fruitGoal: null,
        wish: "",
      });
    });

    it("does not harvest before the fruit is ripe", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      const before = usePortfolioStore.getState().portfolios;

      expect(usePortfolioStore.getState().harvestPlant(id)).toBeNull();
      expect(usePortfolioStore.getState().portfolios).toBe(before);
      expect(useHarvestStore.getState().harvests).toEqual([]);
    });
  });

  describe("setPortfolioAccountIds", () => {
    it("replaces the accountIds array", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().setPortfolioAccountIds(id, ["acc-1", "acc-2"]);
      expect(usePortfolioStore.getState().portfolios[0]!.accountIds).toEqual(["acc-1", "acc-2"]);
    });

    it("deduplicates repeated ids", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().setPortfolioAccountIds(id, ["a", "a", "b"]);
      expect(usePortfolioStore.getState().portfolios[0]!.accountIds).toEqual(["a", "b"]);
    });

    it("moves accounts out of any other portfolio they were linked to", () => {
      const other = usePortfolioStore.getState().addPortfolio("other");
      const target = usePortfolioStore.getState().addPortfolio("target");
      usePortfolioStore.getState().setPortfolioAccountIds(other, ["a", "b"]);

      usePortfolioStore.getState().setPortfolioAccountIds(target, ["a"]);

      const byId = (id: string) =>
        usePortfolioStore.getState().portfolios.find((p) => p.id === id)!;
      expect(byId(target).accountIds).toEqual(["a"]);
      expect(byId(other).accountIds).toEqual(["b"]);
    });
  });

  describe("toggleAccountLink", () => {
    it("adds an account id when not present", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().toggleAccountLink(id, "acc-1");
      expect(usePortfolioStore.getState().portfolios[0]!.accountIds).toEqual(["acc-1"]);
    });

    it("removes an account id when already present", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().setPortfolioAccountIds(id, ["acc-1", "acc-2"]);
      usePortfolioStore.getState().toggleAccountLink(id, "acc-1");
      expect(usePortfolioStore.getState().portfolios[0]!.accountIds).toEqual(["acc-2"]);
    });

    it("moves the account from the portfolio it was linked to", () => {
      const from = usePortfolioStore.getState().addPortfolio("from");
      const to = usePortfolioStore.getState().addPortfolio("to");
      usePortfolioStore.getState().setPortfolioAccountIds(from, ["acc-1", "acc-2"]);

      usePortfolioStore.getState().toggleAccountLink(to, "acc-1");

      const byId = (id: string) =>
        usePortfolioStore.getState().portfolios.find((p) => p.id === id)!;
      expect(byId(to).accountIds).toEqual(["acc-1"]);
      expect(byId(from).accountIds).toEqual(["acc-2"]);
    });

    it("touches updatedAt of the portfolio the account was moved out of", () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const from = usePortfolioStore.getState().addPortfolio("from");
        const to = usePortfolioStore.getState().addPortfolio("to");
        usePortfolioStore.getState().setPortfolioAccountIds(from, ["acc-1"]);

        vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
        usePortfolioStore.getState().toggleAccountLink(to, "acc-1");

        const fromAfter = usePortfolioStore.getState().portfolios.find((p) => p.id === from)!;
        expect(fromAfter.updatedAt).toBe("2026-02-01T00:00:00.000Z");
      } finally {
        vi.useRealTimers();
      }
    });

    it("leaves portfolios that never had the account untouched", () => {
      const untouched = usePortfolioStore.getState().addPortfolio("untouched");
      const to = usePortfolioStore.getState().addPortfolio("to");
      const before = usePortfolioStore.getState().portfolios.find((p) => p.id === untouched);

      usePortfolioStore.getState().toggleAccountLink(to, "acc-1");

      const after = usePortfolioStore.getState().portfolios.find((p) => p.id === untouched);
      expect(after).toBe(before);
    });
  });

  describe("setDriftThreshold", () => {
    it("stores a positive value", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().setDriftThreshold(id, 7.5);
      expect(usePortfolioStore.getState().portfolios[0]!.driftThresholdPercent).toBe(7.5);
    });

    it("clamps negative values to 0", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().setDriftThreshold(id, -3);
      expect(usePortfolioStore.getState().portfolios[0]!.driftThresholdPercent).toBe(0);
    });

    it("falls back to default on NaN", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().setDriftThreshold(id, Number.NaN);
      expect(usePortfolioStore.getState().portfolios[0]!.driftThresholdPercent).toBe(
        DEFAULT_DRIFT_THRESHOLD_PERCENT
      );
    });
  });

  describe("removePortfolio", () => {
    it("removes only the matching portfolio", () => {
      const idA = usePortfolioStore.getState().addPortfolio("A");
      usePortfolioStore.getState().addPortfolio("B");
      usePortfolioStore.getState().removePortfolio(idA);
      const remaining = usePortfolioStore.getState().portfolios;
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.name).toBe("B");
    });
  });

  describe("updatePortfolio", () => {
    it("updates a single field", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().updatePortfolio(id, "note", "리밸런싱 규칙: 분기마다");
      expect(usePortfolioStore.getState().portfolios[0]!.note).toBe("리밸런싱 규칙: 분기마다");
    });

    it("touches updatedAt on update", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      const before = usePortfolioStore.getState().portfolios[0]!.updatedAt;
      // ensure clock can move
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.now() + 1000));
      usePortfolioStore.getState().updatePortfolio(id, "name", "Renamed");
      const after = usePortfolioStore.getState().portfolios[0]!.updatedAt;
      expect(after).not.toBe(before);
      vi.useRealTimers();
    });
  });

  describe("addAllocation", () => {
    it("appends a blank allocation by default", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addAllocation(id);
      const allocations = usePortfolioStore.getState().portfolios[0]!.allocations;
      expect(allocations).toHaveLength(1);
      expect(allocations[0]!).toMatchObject({
        market: "",
        ticker: "",
        name: "",
        targetPercent: 0,
      });
      expect(typeof allocations[0]!.id).toBe("string");
    });

    it("accepts initial values", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addAllocation(id, {
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        targetPercent: 60,
      });
      expect(usePortfolioStore.getState().portfolios[0]!.allocations[0]!).toMatchObject({
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        targetPercent: 60,
      });
    });

    it("assigns a unique id per allocation", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addAllocation(id);
      usePortfolioStore.getState().addAllocation(id);
      const ids = usePortfolioStore.getState().portfolios[0]!.allocations.map((a) => a.id);
      expect(new Set(ids).size).toBe(2);
    });
  });

  describe("updateAllocation", () => {
    it("parses string targetPercent via parseNumericString", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addAllocation(id);
      const aId = usePortfolioStore.getState().portfolios[0]!.allocations[0]!.id;
      usePortfolioStore.getState().updateAllocation(id, aId, "targetPercent", "12.5");
      expect(usePortfolioStore.getState().portfolios[0]!.allocations[0]!.targetPercent).toBe(12.5);
    });

    it("treats empty string as 0", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addAllocation(id);
      const aId = usePortfolioStore.getState().portfolios[0]!.allocations[0]!.id;
      usePortfolioStore.getState().updateAllocation(id, aId, "targetPercent", "30");
      usePortfolioStore.getState().updateAllocation(id, aId, "targetPercent", "");
      expect(usePortfolioStore.getState().portfolios[0]!.allocations[0]!.targetPercent).toBe(0);
    });

    it("updates a non-numeric field directly", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addAllocation(id);
      const aId = usePortfolioStore.getState().portfolios[0]!.allocations[0]!.id;
      usePortfolioStore.getState().updateAllocation(id, aId, "name", "수정됨");
      expect(usePortfolioStore.getState().portfolios[0]!.allocations[0]!.name).toBe("수정됨");
    });
  });

  describe("removeAllocation", () => {
    it("removes only the matching allocation", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addAllocation(id, { ticker: "005930" });
      usePortfolioStore.getState().addAllocation(id, { ticker: "000660" });
      const firstId = usePortfolioStore.getState().portfolios[0]!.allocations[0]!.id;
      usePortfolioStore.getState().removeAllocation(id, firstId);
      const allocations = usePortfolioStore.getState().portfolios[0]!.allocations;
      expect(allocations).toHaveLength(1);
      expect(allocations[0]!.ticker).toBe("000660");
    });
  });

  describe("resetStore", () => {
    it("returns store to initial state", () => {
      usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().resetStore();
      const state = usePortfolioStore.getState();
      expect(state.portfolios).toEqual([]);
    });
  });
});
