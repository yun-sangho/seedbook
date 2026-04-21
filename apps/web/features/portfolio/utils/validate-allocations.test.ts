import { describe, expect, it } from "vitest";
import type { PortfolioAllocation } from "../types/types";
import { validateAllocations } from "./validate-allocations";

function makeAllocation(overrides: Partial<PortfolioAllocation> = {}): PortfolioAllocation {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    market: overrides.market ?? "KOSPI",
    ticker: overrides.ticker ?? "005930",
    name: overrides.name ?? "삼성전자",
    currency: overrides.currency ?? "KRW",
    targetPercent: overrides.targetPercent ?? 0,
  };
}

describe("validateAllocations", () => {
  it("returns OK with totalPercent 0 for empty allocations", () => {
    const result = validateAllocations([]);
    expect(result.code).toBe("OK");
    expect(result.totalPercent).toBe(0);
    expect(result.duplicates).toEqual([]);
  });

  it("returns OK when sum is exactly 100", () => {
    const result = validateAllocations([
      makeAllocation({ ticker: "005930", targetPercent: 60 }),
      makeAllocation({ ticker: "000660", targetPercent: 40 }),
    ]);
    expect(result.code).toBe("OK");
    expect(result.totalPercent).toBe(100);
  });

  it("returns UNDER_100 (soft warning) when sum is less than 100", () => {
    const result = validateAllocations([
      makeAllocation({ ticker: "005930", targetPercent: 60 }),
      makeAllocation({ ticker: "000660", targetPercent: 30 }),
    ]);
    expect(result.code).toBe("UNDER_100");
    expect(result.totalPercent).toBe(90);
  });

  it("returns SUM_EXCEEDS_100 when sum is greater than 100", () => {
    const result = validateAllocations([
      makeAllocation({ ticker: "005930", targetPercent: 60 }),
      makeAllocation({ ticker: "000660", targetPercent: 50 }),
    ]);
    expect(result.code).toBe("SUM_EXCEEDS_100");
    expect(result.totalPercent).toBe(110);
  });

  it("returns DUPLICATE_TICKER with the duplicate keys when same market:ticker appears twice", () => {
    const result = validateAllocations([
      makeAllocation({ market: "KOSPI", ticker: "005930", targetPercent: 30 }),
      makeAllocation({ market: "KOSPI", ticker: "005930", targetPercent: 40 }),
      makeAllocation({ market: "KOSDAQ", ticker: "035720", targetPercent: 30 }),
    ]);
    expect(result.code).toBe("DUPLICATE_TICKER");
    expect(result.duplicates).toContain("KOSPI:005930");
  });

  it("returns NEGATIVE_PERCENT when any allocation has a negative percent", () => {
    const result = validateAllocations([
      makeAllocation({ ticker: "005930", targetPercent: 80 }),
      makeAllocation({ ticker: "000660", targetPercent: -10 }),
    ]);
    expect(result.code).toBe("NEGATIVE_PERCENT");
  });

  it("returns MISSING_TICKER when an allocation has not selected a stock yet", () => {
    const result = validateAllocations([
      makeAllocation({ market: "", ticker: "", name: "", targetPercent: 30 }),
      makeAllocation({ ticker: "005930", targetPercent: 50 }),
    ]);
    expect(result.code).toBe("MISSING_TICKER");
  });

  it("hard errors take priority over UNDER_100 soft warning", () => {
    // sum < 100, but also has a duplicate — duplicate wins
    const result = validateAllocations([
      makeAllocation({ market: "KOSPI", ticker: "005930", targetPercent: 30 }),
      makeAllocation({ market: "KOSPI", ticker: "005930", targetPercent: 30 }),
    ]);
    expect(result.code).toBe("DUPLICATE_TICKER");
  });

  it("SUM_EXCEEDS_100 takes priority over DUPLICATE_TICKER", () => {
    // both errors present — SUM check is most user-actionable so it surfaces first
    const result = validateAllocations([
      makeAllocation({ market: "KOSPI", ticker: "005930", targetPercent: 60 }),
      makeAllocation({ market: "KOSPI", ticker: "005930", targetPercent: 60 }),
    ]);
    expect(result.code).toBe("SUM_EXCEEDS_100");
  });

  it("includes a Korean message for every code", () => {
    const cases: Array<PortfolioAllocation[]> = [
      [],
      [makeAllocation({ targetPercent: 100 })],
      [makeAllocation({ targetPercent: 50 })],
      [makeAllocation({ targetPercent: 150 })],
      [
        makeAllocation({ market: "KOSPI", ticker: "005930", targetPercent: 50 }),
        makeAllocation({ market: "KOSPI", ticker: "005930", targetPercent: 30 }),
      ],
      [makeAllocation({ targetPercent: -1 })],
      [makeAllocation({ market: "", ticker: "", targetPercent: 50 })],
    ];
    for (const allocs of cases) {
      const result = validateAllocations(allocs);
      expect(typeof result.message).toBe("string");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("totalPercent uses sum even when there are negative entries", () => {
    const result = validateAllocations([
      makeAllocation({ ticker: "005930", targetPercent: 100 }),
      makeAllocation({ ticker: "000660", targetPercent: -10 }),
    ]);
    // negative wins as the code, but totalPercent still reflects raw sum
    expect(result.totalPercent).toBe(90);
  });
});
