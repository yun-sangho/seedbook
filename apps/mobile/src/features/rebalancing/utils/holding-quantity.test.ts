import { describe, expect, it } from "vitest";
import { holdingQuantityFor } from "./holding-quantity";

describe("holdingQuantityFor", () => {
  const stock = { market: "KOSPI", ticker: "005930" };

  it("returns 0 when the stock is not held", () => {
    expect(holdingQuantityFor([], stock)).toBe(0);
  });

  it("sums every row of the same stock and ignores other markets", () => {
    const holdings = [
      { ...stock, quantity: 3 },
      { ...stock, quantity: 4 },
      { market: "KOSDAQ", ticker: "005930", quantity: 10 },
    ];
    expect(holdingQuantityFor(holdings, stock)).toBe(7);
  });
});
