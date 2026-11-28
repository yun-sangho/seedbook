import { describe, expect, it } from "vitest";
import {
  formatProfitKorean,
  formatProfitWon,
  getProfitColorClass,
  getProfitPrefix,
} from "./profit-color";

describe("getProfitColorClass", () => {
  it("should return red color class for positive values (국내 관례: 상승 빨강)", () => {
    expect(getProfitColorClass(100)).toBe("text-red-600");
    expect(getProfitColorClass(0.01)).toBe("text-red-600");
    expect(getProfitColorClass(999999)).toBe("text-red-600");
  });

  it("should return empty string for zero", () => {
    expect(getProfitColorClass(0)).toBe("");
  });

  it("should return blue color class for negative values (국내 관례: 하락 파랑)", () => {
    expect(getProfitColorClass(-100)).toBe("text-blue-600");
    expect(getProfitColorClass(-0.01)).toBe("text-blue-600");
    expect(getProfitColorClass(-999999)).toBe("text-blue-600");
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
    expect(formatProfitKorean(166500000)).toBe("+1억6,650만원");
  });

  it("prefixes - for negative values", () => {
    expect(formatProfitKorean(-10000)).toBe("-1만원");
    expect(formatProfitKorean(-166500000)).toBe("-1억6,650만원");
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

describe("formatProfitWon", () => {
  it("shows the full amount with commas and a + sign", () => {
    expect(formatProfitWon(3_721_234)).toBe("+3,721,234원");
  });

  it("shows a - sign for losses", () => {
    expect(formatProfitWon(-1_500)).toBe("-1,500원");
  });

  it("rounds to whole won", () => {
    expect(formatProfitWon(1_234.6)).toBe("+1,235원");
  });

  it("returns 0원 without a sign for zero", () => {
    expect(formatProfitWon(0)).toBe("0원");
  });
});
