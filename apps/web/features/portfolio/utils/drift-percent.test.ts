import { describe, expect, it } from "vitest";
import {
  describeDriftRule,
  driftPercent,
  driftRuleExample,
  exampleTargetPercent,
  formatDriftPercent,
} from "./drift-percent";

describe("driftPercent (absolute)", () => {
  it("is positive when the holding is above its target", () => {
    expect(driftPercent({ targetPercent: 30, actualPercent: 36.2 }, "absolute")).toBeCloseTo(6.2);
  });

  it("is negative when the holding is below its target", () => {
    expect(driftPercent({ targetPercent: 30, actualPercent: 23.8 }, "absolute")).toBeCloseTo(-6.2);
  });
});

describe("driftPercent (relative)", () => {
  it("measures the difference as a share of the target", () => {
    // 목표 20% 에 현재 25% → 목표보다 25% 많다.
    expect(driftPercent({ targetPercent: 20, actualPercent: 25 }, "relative")).toBeCloseTo(25);
  });

  it("is negative when the holding is below its target", () => {
    expect(driftPercent({ targetPercent: 40, actualPercent: 30 }, "relative")).toBeCloseTo(-25);
  });

  it("is -100% when nothing of a target is held", () => {
    expect(driftPercent({ targetPercent: 10, actualPercent: 0 }, "relative")).toBeCloseTo(-100);
  });

  it("falls back to the %p difference when the target is 0 (e.g. idle cash)", () => {
    expect(driftPercent({ targetPercent: 0, actualPercent: 3 }, "relative")).toBeCloseTo(3);
  });
});

describe("formatDriftPercent", () => {
  it("prefixes a plus sign for overweight drift", () => {
    expect(formatDriftPercent(6.24)).toBe("+6.2%");
  });

  it("keeps the minus sign for underweight drift", () => {
    expect(formatDriftPercent(-6.26)).toBe("-6.3%");
  });

  it("shows 0.0% without a sign when the drift rounds to zero", () => {
    expect(formatDriftPercent(-0.04)).toBe("0.0%");
    expect(formatDriftPercent(0.04)).toBe("0.0%");
  });
});

describe("describeDriftRule", () => {
  it("reads a relative rule as a share of the target weight", () => {
    expect(describeDriftRule({ driftMode: "relative", driftThresholdPercent: 15 })).toBe(
      "목표 비중의 15% 넘게 벗어나면"
    );
  });

  it("reads an absolute rule as a %p difference in weight", () => {
    expect(describeDriftRule({ driftMode: "absolute", driftThresholdPercent: 5 })).toBe(
      "비중이 5%p 넘게 차이 나면"
    );
  });

  it("keeps decimal thresholds", () => {
    expect(describeDriftRule({ driftMode: "absolute", driftThresholdPercent: 2.5 })).toBe(
      "비중이 2.5%p 넘게 차이 나면"
    );
  });
});

describe("driftRuleExample", () => {
  it("gives the allowed range for a relative rule", () => {
    expect(driftRuleExample({ driftMode: "relative", driftThresholdPercent: 15 }, 20)).toEqual({
      target: "20%",
      range: "17%~23%",
    });
  });

  it("gives the allowed range for an absolute rule", () => {
    expect(driftRuleExample({ driftMode: "absolute", driftThresholdPercent: 15 }, 20)).toEqual({
      target: "20%",
      range: "5%~35%",
    });
  });

  it("keeps the range within 0% and 100%", () => {
    expect(driftRuleExample({ driftMode: "absolute", driftThresholdPercent: 15 }, 10).range).toBe(
      "0%~25%"
    );
    expect(driftRuleExample({ driftMode: "relative", driftThresholdPercent: 50 }, 80).range).toBe(
      "40%~100%"
    );
  });

  it("rounds the bounds to one decimal place", () => {
    expect(driftRuleExample({ driftMode: "relative", driftThresholdPercent: 15 }, 12).range).toBe(
      "10.2%~13.8%"
    );
  });

  it("has no range when the threshold is 0 (any move warns)", () => {
    expect(driftRuleExample({ driftMode: "relative", driftThresholdPercent: 0 }, 20)).toEqual({
      target: "20%",
      range: null,
    });
  });
});

describe("exampleTargetPercent", () => {
  it("uses the largest target in the portfolio", () => {
    expect(
      exampleTargetPercent([{ targetPercent: 12 }, { targetPercent: 30 }, { targetPercent: 5 }])
    ).toBe(30);
  });

  it("falls back to 20% when there is no positive target", () => {
    expect(exampleTargetPercent([])).toBe(20);
    expect(exampleTargetPercent([{ targetPercent: 0 }])).toBe(20);
  });
});
