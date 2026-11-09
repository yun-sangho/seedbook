import { describe, expect, it } from "vitest";
import { formatQuantityChange } from "./format-quantity-change";

describe("formatQuantityChange", () => {
  it("prefixes a bought quantity with + and thousands separators", () => {
    expect(formatQuantityChange(5_766)).toBe("+5,766");
  });

  it("prefixes a sold quantity with a minus sign", () => {
    expect(formatQuantityChange(-5)).toBe("−5");
  });

  it("returns an empty string for no change", () => {
    expect(formatQuantityChange(0)).toBe("");
  });
});
