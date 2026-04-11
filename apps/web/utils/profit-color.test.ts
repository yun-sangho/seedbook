import { describe, expect, it } from "vitest";
import { formatProfitKorean, getProfitColorClass, getProfitPrefix } from "./profit-color";

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

  it("should return - for negative values", () => {
    expect(getProfitPrefix(-100)).toBe("-");
    expect(getProfitPrefix(-0.01)).toBe("-");
    expect(getProfitPrefix(-999999)).toBe("-");
  });
});

describe("formatProfitKorean", () => {
  it("prefixes + for positive values", () => {
    expect(formatProfitKorean(10000)).toBe("+1만원");
    expect(formatProfitKorean(166500000)).toBe("+1억6650만원");
  });

  it("prefixes - for negative values", () => {
    expect(formatProfitKorean(-10000)).toBe("-1만원");
    expect(formatProfitKorean(-166500000)).toBe("-1억6650만원");
  });

  it("returns 0원 without a sign for zero", () => {
    expect(formatProfitKorean(0)).toBe("0원");
  });

  it("does not double up the minus sign", () => {
    const result = formatProfitKorean(-12345678);
    expect(result.startsWith("--")).toBe(false);
    expect(result.startsWith("-")).toBe(true);
  });
});
