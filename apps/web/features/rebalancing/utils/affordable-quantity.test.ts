import { describe, expect, it } from "vitest";
import { affordableQuantity } from "./affordable-quantity";

describe("affordableQuantity", () => {
  it("rounds down to whole shares", () => {
    expect(affordableQuantity(1_789_155, 58_430)).toBe(30);
  });

  it("includes a purchase that uses the cash exactly", () => {
    expect(affordableQuantity(1_000, 100)).toBe(10);
  });

  it("returns 0 when cash is empty, already negative, or below one share", () => {
    expect(affordableQuantity(0, 100)).toBe(0);
    expect(affordableQuantity(-500, 100)).toBe(0);
    expect(affordableQuantity(99, 100)).toBe(0);
  });

  it("returns 0 when the price is not positive", () => {
    expect(affordableQuantity(1_000, 0)).toBe(0);
  });
});
