import { describe, expect, it } from "vitest";
import { computeDriftAlert, isDriftBreached } from "./compute-drift-alert";
import type { RebalancingGapRow } from "./compute-rebalancing-gap";

function row(overrides: Partial<RebalancingGapRow>): RebalancingGapRow {
  const targetPercent = overrides.targetPercent ?? 50;
  const actualPercent = overrides.actualPercent ?? 50;
  return {
    allocationId: "a",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    targetValue: 0,
    actualValue: 0,
    gapValue: 0,
    action: "유지",
    ...overrides,
    targetPercent,
    actualPercent,
    gapPercent: targetPercent - actualPercent,
  };
}

const absolute = (threshold: number) =>
  ({ driftThresholdPercent: threshold, driftMode: "absolute" }) as const;
const relative = (threshold: number) =>
  ({ driftThresholdPercent: threshold, driftMode: "relative" }) as const;

describe("computeDriftAlert (absolute)", () => {
  it("reports no breach when all gaps are within threshold", () => {
    const summary = {
      rows: [row({ actualPercent: 48 }), row({ actualPercent: 53 }), row({ actualPercent: 49 })],
    };
    const alert = computeDriftAlert(summary, absolute(5));
    expect(alert.hasBreach).toBe(false);
    expect(alert.breachedRows).toEqual([]);
    expect(alert.maxAbsGapPercent).toBeCloseTo(3);
  });

  it("collects rows strictly over the threshold (uses > not >=)", () => {
    const summary = {
      rows: [
        row({ allocationId: "exact", actualPercent: 45 }),
        row({ allocationId: "over", actualPercent: 44 }),
        row({ allocationId: "neg", actualPercent: 57 }),
      ],
    };
    const alert = computeDriftAlert(summary, absolute(5));
    expect(alert.breachedRows.map((r) => r.allocationId)).toEqual(["over", "neg"]);
    expect(alert.maxAbsGapPercent).toBeCloseTo(7);
  });

  it("returns 0 maxAbsGap and no breach when rows are empty", () => {
    const alert = computeDriftAlert({ rows: [] }, absolute(5));
    expect(alert.maxAbsGapPercent).toBe(0);
    expect(alert.hasBreach).toBe(false);
    expect(alert.breachedRows).toEqual([]);
  });

  it("threshold 0 flags anything non-zero", () => {
    const summary = { rows: [row({ actualPercent: 50 }), row({ actualPercent: 50.1 })] };
    const alert = computeDriftAlert(summary, absolute(0));
    expect(alert.breachedRows).toHaveLength(1);
  });

  it("flags idle cash over the threshold as a breach", () => {
    const summary = {
      rows: [row({ actualPercent: 49 })],
      cashRow: row({ allocationId: "cash", name: "예수금", targetPercent: 0, actualPercent: 20 }),
    };
    const alert = computeDriftAlert(summary, absolute(5));
    expect(alert.breachedRows.map((r) => r.allocationId)).toEqual(["cash"]);
    expect(alert.maxAbsGapPercent).toBeCloseTo(20);
  });
});

describe("computeDriftAlert (relative)", () => {
  it("judges a small target by its own size, not by %p", () => {
    // 목표 10% → 현재 13%: 3%p 차이지만 목표 대비 30% 초과.
    const summary = {
      rows: [row({ allocationId: "small", targetPercent: 10, actualPercent: 13 })],
    };
    expect(computeDriftAlert(summary, absolute(5)).hasBreach).toBe(false);
    const alert = computeDriftAlert(summary, relative(20));
    expect(alert.breachedRows.map((r) => r.allocationId)).toEqual(["small"]);
    expect(alert.maxAbsGapPercent).toBeCloseTo(30);
  });

  it("tolerates a larger %p gap on a large target", () => {
    // 목표 60% → 현재 66%: 6%p 차이지만 목표 대비 10%.
    const summary = { rows: [row({ targetPercent: 60, actualPercent: 66 })] };
    expect(computeDriftAlert(summary, absolute(5)).hasBreach).toBe(true);
    expect(computeDriftAlert(summary, relative(20)).hasBreach).toBe(false);
  });

  it("judges idle cash (target 0) by its %p share", () => {
    const summary = {
      rows: [],
      cashRow: row({ allocationId: "cash", targetPercent: 0, actualPercent: 3 }),
    };
    expect(computeDriftAlert(summary, relative(5)).hasBreach).toBe(false);
    expect(computeDriftAlert(summary, relative(2)).hasBreach).toBe(true);
  });
});

describe("isDriftBreached", () => {
  it("uses the portfolio's drift mode", () => {
    const r = row({ targetPercent: 10, actualPercent: 13 });
    expect(isDriftBreached(r, absolute(5))).toBe(false);
    expect(isDriftBreached(r, relative(20))).toBe(true);
  });
});
