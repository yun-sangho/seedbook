import { describe, expect, it } from "vitest";
import {
  calculateReturnRate,
  formatReturnRate,
  formatWithCommas,
  numberToKorean,
  parseNumericString,
} from "./number-format";

describe("numberToKorean", () => {
  it("should return empty string for invalid inputs", () => {
    expect(numberToKorean("")).toBe("");
    expect(numberToKorean("abc")).toBe("");
  });

  it('should return "0만원" for zero', () => {
    expect(numberToKorean(0)).toBe("0만원");
  });

  it("should format man (10,000) unit correctly", () => {
    expect(numberToKorean(5000)).toBe("5000만원");
  });

  it("should format eok (100,000,000) unit correctly", () => {
    expect(numberToKorean(10000)).toBe("1억원");
    expect(numberToKorean(12345)).toBe("1억2345만원");
  });

  it("should format jo (1,000,000,000,000) unit correctly", () => {
    expect(numberToKorean(1000000)).toBe("1조원");
    expect(numberToKorean(1020000)).toBe("1조2억원");
    expect(numberToKorean(1002000)).toBe("1조2000만원");
    expect(numberToKorean(1020300)).toBe("1조2억300만원");
  });
});

describe("parseNumericString", () => {
  it("should parse string with commas correctly", () => {
    expect(parseNumericString("1,234,567")).toBe(1234567);
    expect(parseNumericString("1,234.56")).toBe(1234.56);
  });
});

describe("formatWithCommas", () => {
  it("should format numbers with commas", () => {
    expect(formatWithCommas(1234567)).toBe("1,234,567");
  });
});

describe("calculateReturnRate", () => {
  it("should calculate return rate correctly", () => {
    expect(calculateReturnRate(120, 100)).toBe(20);
    expect(calculateReturnRate(80, 100)).toBe(-20);
  });

  it("should return 0 when initial investment is 0", () => {
    expect(calculateReturnRate(100, 0)).toBe(0);
  });
});

describe("formatReturnRate", () => {
  it("should format positive return rates with plus sign", () => {
    expect(formatReturnRate(20)).toBe("+20.00%");
  });

  it("should format negative return rates with minus sign", () => {
    expect(formatReturnRate(-20)).toBe("-20.00%");
  });
});
