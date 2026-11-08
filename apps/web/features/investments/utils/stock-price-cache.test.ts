import { describe, expect, it } from "vitest";
import { isPriceFresh, PRICE_CACHE_TTL_MS, selectKeysToFetch } from "./stock-price-cache";

const NOW = 1_700_000_000_000;
const point = { close: 70000, date: "2024-01-15" };

describe("isPriceFresh", () => {
  it("returns false when there is no cached entry", () => {
    expect(isPriceFresh(undefined, NOW)).toBe(false);
  });

  it("returns true while the entry is younger than the TTL", () => {
    expect(isPriceFresh({ point, fetchedAt: NOW - PRICE_CACHE_TTL_MS + 1 }, NOW)).toBe(true);
  });

  it("returns false once the entry reaches the TTL", () => {
    expect(isPriceFresh({ point, fetchedAt: NOW - PRICE_CACHE_TTL_MS }, NOW)).toBe(false);
  });

  it("treats a cached 'no price' result as fresh within the TTL", () => {
    expect(isPriceFresh({ point: null, fetchedAt: NOW - 1000 }, NOW)).toBe(true);
  });
});

describe("selectKeysToFetch", () => {
  it("returns keys that are not cached at all", () => {
    expect(selectKeysToFetch(["KOSPI:005930"], {}, new Set(), NOW)).toEqual(["KOSPI:005930"]);
  });

  it("skips keys whose cached entry is still fresh", () => {
    const entries = { "KOSPI:005930": { point, fetchedAt: NOW - 1000 } };
    expect(selectKeysToFetch(["KOSPI:005930"], entries, new Set(), NOW)).toEqual([]);
  });

  it("returns keys whose cached entry is stale", () => {
    const entries = { "KOSPI:005930": { point, fetchedAt: NOW - PRICE_CACHE_TTL_MS - 1 } };
    expect(selectKeysToFetch(["KOSPI:005930"], entries, new Set(), NOW)).toEqual(["KOSPI:005930"]);
  });

  it("skips keys that are already being fetched", () => {
    expect(selectKeysToFetch(["KOSPI:005930"], {}, new Set(["KOSPI:005930"]), NOW)).toEqual([]);
  });

  it("returns only the missing keys from a mixed list, without duplicates", () => {
    const entries = { "KOSPI:005930": { point, fetchedAt: NOW - 1000 } };
    expect(
      selectKeysToFetch(
        ["KOSPI:005930", "KOSPI:000660", "KOSPI:000660", "NASDAQ:AAPL"],
        entries,
        new Set(["NASDAQ:AAPL"]),
        NOW
      )
    ).toEqual(["KOSPI:000660"]);
  });
});
