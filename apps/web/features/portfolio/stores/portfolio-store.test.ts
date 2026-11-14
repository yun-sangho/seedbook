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
// biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
global.localStorage = localStorageMock as any;

describe("Portfolio Store", () => {
  beforeEach(() => {
    usePortfolioStore.getState().resetStore();
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

  describe("setAllocationStockFromSearch", () => {
    it("writes market/ticker/name/currency atomically and preserves targetPercent", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addAllocation(id, { targetPercent: 25 });
      const aId = usePortfolioStore.getState().portfolios[0]!.allocations[0]!.id;
      usePortfolioStore.getState().setAllocationStockFromSearch(id, aId, {
        market: "KOSDAQ",
        ticker: "035720",
        name: "카카오",
        currency: "KRW",
      });
      const a = usePortfolioStore.getState().portfolios[0]!.allocations[0]!;
      expect(a).toMatchObject({
        market: "KOSDAQ",
        ticker: "035720",
        name: "카카오",
        currency: "KRW",
        targetPercent: 25,
      });
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

  describe("reorderPortfolios", () => {
    it("replaces the array order", () => {
      const a = usePortfolioStore.getState().addPortfolio("A");
      const b = usePortfolioStore.getState().addPortfolio("B");
      const c = usePortfolioStore.getState().addPortfolio("C");
      const current = usePortfolioStore.getState().portfolios;
      // Current order is C, B, A (most recent first). Reorder to A, B, C.
      const reordered = [
        current.find((p) => p.id === a)!,
        current.find((p) => p.id === b)!,
        current.find((p) => p.id === c)!,
      ];
      usePortfolioStore.getState().reorderPortfolios(reordered);
      expect(usePortfolioStore.getState().portfolios.map((p) => p.name)).toEqual(["A", "B", "C"]);
    });
  });

  describe("Persist Config", () => {
    it("migrate (v1 -> v2) fills accountIds and driftThresholdPercent with defaults", () => {
      // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
      const persistApi = (usePortfolioStore as any).persist;
      const migrate = persistApi.getOptions().migrate as (
        persisted: unknown,
        version: number
      ) => { portfolios: PortfolioItem[] };

      const legacy = {
        portfolios: [
          {
            id: "p1",
            name: "Legacy",
            description: "",
            color: "#3b82f6",
            allocations: [],
            note: "",
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        ],
      };
      const migrated = migrate(legacy, 1);
      expect(migrated.portfolios[0]!.accountIds).toEqual([]);
      expect(migrated.portfolios[0]!.driftThresholdPercent).toBe(DEFAULT_DRIFT_THRESHOLD_PERCENT);
    });

    it("migrate preserves existing v2 values", () => {
      // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
      const persistApi = (usePortfolioStore as any).persist;
      const migrate = persistApi.getOptions().migrate as (
        persisted: unknown,
        version: number
      ) => { portfolios: PortfolioItem[] };

      const existing = {
        portfolios: [
          {
            id: "p1",
            name: "Already v2",
            description: "",
            color: "#3b82f6",
            allocations: [],
            accountIds: ["acc-1"],
            driftThresholdPercent: 3,
            note: "",
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        ],
      };
      const migrated = migrate(existing, 2);
      expect(migrated.portfolios[0]!.accountIds).toEqual(["acc-1"]);
      expect(migrated.portfolios[0]!.driftThresholdPercent).toBe(3);
    });

    it("migrate (v2 -> v3) keeps a shared account only in the most recently updated portfolio", () => {
      // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
      const persistApi = (usePortfolioStore as any).persist;
      const migrate = persistApi.getOptions().migrate as (
        persisted: unknown,
        version: number
      ) => { portfolios: PortfolioItem[] };

      const base = {
        color: "#3b82f6",
        allocations: [],
        driftThresholdPercent: 5,
        note: "",
        createdAt: "2026-01-01T00:00:00.000Z",
      };
      const v2 = {
        portfolios: [
          {
            ...base,
            id: "old",
            name: "old",
            accountIds: ["acc-1", "acc-2"],
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            ...base,
            id: "new",
            name: "new",
            accountIds: ["acc-1"],
            updatedAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      };

      const migrated = migrate(v2, 2);

      expect(migrated.portfolios.map((p) => p.accountIds)).toEqual([["acc-2"], ["acc-1"]]);
    });

    it("persists at version 3", () => {
      // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
      const persistApi = (usePortfolioStore as any).persist;
      expect(persistApi.getOptions().version).toBe(3);
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
