import { describe, expect, it } from "vitest";
import { getProfitColorClass, getProfitPrefix } from "./profit-color";

describe("getProfitColorClass", () => {
  it("should return blue color class for positive values", () => {
    expect(getProfitColorClass(100)).toBe("text-blue-600");
    expect(getProfitColorClass(0.01)).toBe("text-blue-600");
    expect(getProfitColorClass(999999)).toBe("text-blue-600");
  });

  it("should return empty string for zero", () => {
    expect(getProfitColorClass(0)).toBe("");
  });

  it("should return red color class for negative values", () => {
    expect(getProfitColorClass(-100)).toBe("text-red-600");
    expect(getProfitColorClass(-0.01)).toBe("text-red-600");
    expect(getProfitColorClass(-999999)).toBe("text-red-600");
  });
});

describe("getProfitPrefix", () => {
  it("should return + for positive values", () => {
    expect(getProfitPrefix(100)).toBe("+");
    expect(getProfitPrefix(0.01)).toBe("+");
    expect(getProfitPrefix(999999)).toBe("+");
  });

  it("should return empty string for zero", () => {
    expect(getProfitPrefix(0)).toBe("");
  });

  it("should return empty string for negative values", () => {
    expect(getProfitPrefix(-100)).toBe("");
    expect(getProfitPrefix(-0.01)).toBe("");
    expect(getProfitPrefix(-999999)).toBe("");
  });
});
