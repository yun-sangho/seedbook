import { describe, expect, it } from "vitest";
import { driftPercent, formatDriftPercent } from "./drift-percent";

describe("driftPercent", () => {
  it("is positive when the holding is above its target", () => {
    expect(driftPercent({ targetPercent: 30, actualPercent: 36.2 })).toBeCloseTo(6.2);
  });

  it("is negative when the holding is below its target", () => {
    expect(driftPercent({ targetPercent: 30, actualPercent: 23.8 })).toBeCloseTo(-6.2);
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
