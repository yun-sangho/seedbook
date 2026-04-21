import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortfolioStore } from "./portfolio-store";

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.localStorage = localStorageMock as any;

describe("Portfolio Store", () => {
  beforeEach(() => {
    usePortfolioStore.getState().resetStore();
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("starts with empty portfolios and no expanded form", () => {
      const state = usePortfolioStore.getState();
      expect(state.portfolios).toEqual([]);
      expect(state.expandedFormId).toBe("");
    });
  });

  describe("addPortfolio", () => {
    it("creates a portfolio with a unique id and color", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      const state = usePortfolioStore.getState();
      expect(state.portfolios).toHaveLength(1);
      expect(state.portfolios[0]!.id).toBe(id);
      expect(state.portfolios[0]!.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(state.expandedFormId).toBe(id);
    });

    it("uses provided name when given", () => {
      usePortfolioStore.getState().addPortfolio("내 전략");
      expect(usePortfolioStore.getState().portfolios[0]!.name).toBe("내 전략");
    });

    it("falls back to a default name when none is given", () => {
      usePortfolioStore.getState().addPortfolio();
      const name = usePortfolioStore.getState().portfolios[0]!.name;
      expect(name.length).toBeGreaterThan(0);
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

    it("clears expandedFormId if the removed portfolio was expanded", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      expect(usePortfolioStore.getState().expandedFormId).toBe(id);
      usePortfolioStore.getState().removePortfolio(id);
      expect(usePortfolioStore.getState().expandedFormId).toBe("");
    });
  });

  describe("updatePortfolio", () => {
    it("updates a single field", () => {
      const id = usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().updatePortfolio(id, "description", "공격형 분배");
      expect(usePortfolioStore.getState().portfolios[0]!.description).toBe("공격형 분배");
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
    it("partialize excludes expandedFormId", () => {
      usePortfolioStore.getState().addPortfolio();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const persistApi = (usePortfolioStore as any).persist;
      const partialize = persistApi.getOptions().partialize;
      const snapshot = partialize(usePortfolioStore.getState()) as Record<string, unknown>;
      expect(snapshot.portfolios).toBeDefined();
      expect(snapshot.expandedFormId).toBeUndefined();
    });
  });

  describe("resetStore", () => {
    it("returns store to initial state", () => {
      usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().addPortfolio();
      usePortfolioStore.getState().setExpandedFormId("anything");
      usePortfolioStore.getState().resetStore();
      const state = usePortfolioStore.getState();
      expect(state.portfolios).toEqual([]);
      expect(state.expandedFormId).toBe("");
    });
  });
});
