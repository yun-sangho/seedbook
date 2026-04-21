import { describe, expect, it } from "vitest";
import { computeDriftAlert } from "./compute-drift-alert";
import type { RebalancingGapRow } from "./compute-rebalancing-gap";

function row(overrides: Partial<RebalancingGapRow>): RebalancingGapRow {
  return {
    allocationId: "a",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    targetPercent: 50,
    actualPercent: 50,
    gapPercent: 0,
    targetValue: 0,
    actualValue: 0,
    gapValue: 0,
    action: "유지",
    ...overrides,
  };
}

describe("computeDriftAlert", () => {
  it("reports no breach when all gaps are within threshold", () => {
    const summary = {
      rows: [row({ gapPercent: 2 }), row({ gapPercent: -3 }), row({ gapPercent: 1 })],
    };
    const alert = computeDriftAlert(summary, 5);
    expect(alert.hasBreach).toBe(false);
    expect(alert.breachedRows).toEqual([]);
    expect(alert.maxAbsGapPercent).toBe(3);
  });

  it("collects rows strictly over the threshold (uses > not >=)", () => {
    const summary = {
      rows: [
        row({ allocationId: "exact", gapPercent: 5 }),
        row({ allocationId: "over", gapPercent: 6 }),
        row({ allocationId: "neg", gapPercent: -7 }),
      ],
    };
    const alert = computeDriftAlert(summary, 5);
    expect(alert.hasBreach).toBe(true);
    expect(alert.breachedRows.map((r) => r.allocationId)).toEqual(["over", "neg"]);
    expect(alert.maxAbsGapPercent).toBe(7);
  });

  it("returns 0 maxAbsGap and no breach when rows are empty", () => {
    const alert = computeDriftAlert({ rows: [] }, 5);
    expect(alert.maxAbsGapPercent).toBe(0);
    expect(alert.hasBreach).toBe(false);
    expect(alert.breachedRows).toEqual([]);
  });

  it("threshold 0 flags anything non-zero", () => {
    const summary = { rows: [row({ gapPercent: 0 }), row({ gapPercent: 0.1 })] };
    const alert = computeDriftAlert(summary, 0);
    expect(alert.breachedRows).toHaveLength(1);
  });
});
