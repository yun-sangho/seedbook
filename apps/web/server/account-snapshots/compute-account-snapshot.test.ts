import { computeAccountSnapshot, type SnapshotPrice, snapshotPriceKey } from "@seedbook/database";
import { describe, expect, it } from "vitest";

const prices = new Map<string, SnapshotPrice>([
  [snapshotPriceKey("KOSPI", "005930"), { close: 70_000, date: "2026-11-27" }],
  [snapshotPriceKey("KOSDAQ", "035720"), { close: 41_250, date: "2026-11-26" }],
]);

describe("computeAccountSnapshot", () => {
  it("values an account with no holdings and no cash at 0", () => {
    expect(computeAccountSnapshot([], [], prices)).toEqual({
      stockValue: 0,
      cashValue: 0,
      totalValue: 0,
      holdingCount: 0,
      missingPriceCount: 0,
      oldestPriceDate: null,
    });
  });

  it("multiplies each holding by its close and adds cash", () => {
    const result = computeAccountSnapshot(
      [{ market: "KOSPI", ticker: "005930", quantity: 10 }],
      [50_000],
      prices
    );

    expect(result).toMatchObject({ stockValue: 700_000, cashValue: 50_000, totalValue: 750_000 });
  });

  it("leaves a holding without any price out of the value and counts it as missing", () => {
    const result = computeAccountSnapshot(
      [
        { market: "KOSPI", ticker: "005930", quantity: 1 },
        { market: "KOSPI", ticker: "999999", quantity: 100 },
      ],
      [],
      prices
    );

    expect(result).toMatchObject({ stockValue: 70_000, holdingCount: 2, missingPriceCount: 1 });
  });

  it("values a cash-only account at its cash", () => {
    const result = computeAccountSnapshot([], [1_234_567], prices);

    expect(result).toMatchObject({ stockValue: 0, cashValue: 1_234_567, totalValue: 1_234_567 });
  });

  it("sums several cash items", () => {
    const result = computeAccountSnapshot([], [100_000, 25_000, 5_000], prices);

    expect(result.cashValue).toBe(130_000);
  });

  it("keeps negative cash (bought more than the cash on hand) in the total", () => {
    const result = computeAccountSnapshot(
      [{ market: "KOSPI", ticker: "005930", quantity: 10 }],
      [-30_000],
      prices
    );

    expect(result).toMatchObject({ cashValue: -30_000, totalValue: 670_000 });
  });

  it("rounds each fractional holding to whole won", () => {
    const result = computeAccountSnapshot(
      [{ market: "KOSDAQ", ticker: "035720", quantity: 0.5 }],
      [],
      prices
    );

    expect(result.stockValue).toBe(20_625);
  });

  it("ignores legacy holdings without a market or ticker, like the account screen", () => {
    const result = computeAccountSnapshot(
      [
        { market: "", ticker: "", quantity: 3 },
        { market: "KOSPI", ticker: "005930", quantity: 1 },
      ],
      [],
      prices
    );

    expect(result).toMatchObject({ stockValue: 70_000, holdingCount: 1, missingPriceCount: 0 });
  });

  it("reports the oldest close date used, so a fallback to an earlier close is visible", () => {
    const result = computeAccountSnapshot(
      [
        { market: "KOSPI", ticker: "005930", quantity: 1 },
        { market: "KOSDAQ", ticker: "035720", quantity: 1 },
      ],
      [],
      prices
    );

    expect(result.oldestPriceDate).toBe("2026-11-26");
  });
});
