import { describe, expect, it } from "vitest";
import {
  calculateReturnRate,
  formatReturnRate,
  formatWithCommas,
  numberToKorean,
  parseNumericString,
  truncateToHighestDenomination,
} from "./number-format";

describe("numberToKorean", () => {
  it("should return empty string for invalid inputs", () => {
    expect(numberToKorean("")).toBe("");
    expect(numberToKorean("abc")).toBe("");
  });

  it('should return "0원" for zero', () => {
    expect(numberToKorean(0)).toBe("0원");
  });

  it('should return "0원" for values under 1만원', () => {
    expect(numberToKorean(9999)).toBe("0원");
    expect(numberToKorean(5000)).toBe("0원");
  });

  it("should format man (만원) unit correctly", () => {
    expect(numberToKorean(10000)).toBe("1만원");
    expect(numberToKorean(50000000)).toBe("5000만원");
    expect(numberToKorean(99990000)).toBe("9999만원");
  });

  it("should format eok (억원) unit correctly", () => {
    expect(numberToKorean(100000000)).toBe("1억원");
    expect(numberToKorean(123450000)).toBe("1억2345만원");
    expect(numberToKorean(1123450000)).toBe("11억2345만원");
    expect(numberToKorean(11123450000)).toBe("111억2345만원");
  });

  it("should format jo (조원) unit correctly", () => {
    expect(numberToKorean(1000000000000)).toBe("1조원");
    expect(numberToKorean(1000200000000)).toBe("1조2억원");
    expect(numberToKorean(1000020000000)).toBe("1조2000만원");
    expect(numberToKorean(1000203000000)).toBe("1조2억300만원");
  });

  it("should truncate sub-만원 fractions", () => {
    expect(numberToKorean(10005000)).toBe("1000만원");
    expect(numberToKorean(100009999)).toBe("1억원");
  });

  it("should handle string input as 원 unit", () => {
    expect(numberToKorean("50000000")).toBe("5000만원");
    expect(numberToKorean("100000000")).toBe("1억원");
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

describe("truncateToHighestDenomination", () => {
  it("should truncate to billions (억) with one decimal place", () => {
    expect(truncateToHighestDenomination("1억2345만원")).toBe("1.2억원");
    expect(truncateToHighestDenomination("5억9999만원")).toBe("6.0억원");
    expect(truncateToHighestDenomination("1억원")).toBe("1억원");
    expect(truncateToHighestDenomination("1억500만원")).toBe("1.1억원");
  });

  it("should truncate to trillions (조) with one decimal place", () => {
    expect(truncateToHighestDenomination("1조3453억1234만원")).toBe("1.3조원");
    expect(truncateToHighestDenomination("2조9999억만원")).toBe("3.0조원");
    expect(truncateToHighestDenomination("1조원")).toBe("1조원");
  });

  it("should return original string for invalid or non-matching inputs", () => {
    expect(truncateToHighestDenomination("")).toBe("");
    expect(truncateToHighestDenomination("1000만원")).toBe("1000만원");
    expect(truncateToHighestDenomination("invalid")).toBe("invalid");
  });
});
