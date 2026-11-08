import { describe, expect, it } from "vitest";
import { formatMoneyDraft, moneyDraftReading, sanitizePercentDraft } from "./input-format";

describe("formatMoneyDraft", () => {
  it("adds thousands separators", () => {
    expect(formatMoneyDraft("1234567")).toBe("1,234,567");
  });

  it("re-formats an already formatted value after an edit", () => {
    expect(formatMoneyDraft("1,234,5678")).toBe("12,345,678");
  });

  it("drops non-digit characters such as a pasted 원 suffix", () => {
    expect(formatMoneyDraft("50,000원")).toBe("50,000");
  });

  it("returns an empty string for empty input", () => {
    expect(formatMoneyDraft("")).toBe("");
  });

  it("strips leading zeros but keeps a single zero", () => {
    expect(formatMoneyDraft("007")).toBe("7");
    expect(formatMoneyDraft("0")).toBe("0");
  });
});

describe("sanitizePercentDraft", () => {
  it("keeps a decimal value as typed", () => {
    expect(sanitizePercentDraft("12.5")).toBe("12.5");
  });

  it("keeps a trailing dot while the user is still typing", () => {
    expect(sanitizePercentDraft("12.")).toBe("12.");
  });

  it("collapses extra dots into the first one", () => {
    expect(sanitizePercentDraft("1.2.3")).toBe("1.23");
  });

  it("drops non-numeric characters", () => {
    expect(sanitizePercentDraft("10%")).toBe("10");
  });
});

describe("moneyDraftReading", () => {
  it("reads 1만원 and above in Korean units", () => {
    expect(moneyDraftReading("1,234,567")).toBe("123만원");
  });

  it("shows nothing below 1만원 instead of 0원", () => {
    expect(moneyDraftReading("5,000")).toBeUndefined();
  });

  it("shows nothing for exactly 9,999원", () => {
    expect(moneyDraftReading("9,999")).toBeUndefined();
  });

  it("reads exactly 10,000원 as 1만원", () => {
    expect(moneyDraftReading("10,000")).toBe("1만원");
  });

  it("shows nothing for empty or zero input", () => {
    expect(moneyDraftReading("")).toBeUndefined();
    expect(moneyDraftReading("0")).toBeUndefined();
  });
});
