import { describe, expect, it } from "vitest";
import type { StockHolding } from "../types/types";
import { sortHoldings, type SortPricePoint } from "./sort-holdings";
import { stockPriceKey } from "./use-stock-prices";

function makeHolding(overrides: Partial<StockHolding> & { id: number }): StockHolding {
  return {
    id: overrides.id,
    market: overrides.market ?? "KOSPI",
    ticker: overrides.ticker ?? String(overrides.id).padStart(6, "0"),
    name: overrides.name ?? `종목${overrides.id}`,
    currency: overrides.currency ?? "KRW",
    quantity: overrides.quantity ?? 1,
    memo: overrides.memo ?? "",
  };
}

function makePrices(entries: Array<[StockHolding, number]>): Map<string, SortPricePoint> {
  const map = new Map<string, SortPricePoint>();
  for (const [h, close] of entries) {
    map.set(stockPriceKey(h.market, h.ticker), { close });
  }
  return map;
}

describe("sortHoldings", () => {
  describe("default option", () => {
    it("returns the original array reference without copying", () => {
      const holdings = [
        makeHolding({ id: 1, quantity: 10 }),
        makeHolding({ id: 2, quantity: 20 }),
      ];
      const prices = makePrices([
        [holdings[0]!, 1000],
        [holdings[1]!, 2000],
      ]);

      const result = sortHoldings(holdings, prices, "default");

      expect(result).toBe(holdings);
    });
  });

  describe("price sort", () => {
    const samsung = makeHolding({ id: 1, ticker: "005930", quantity: 10 });
    const hynix = makeHolding({ id: 2, ticker: "000660", quantity: 5 });
    const kakao = makeHolding({ id: 3, ticker: "035720", quantity: 100 });
    const holdings = [samsung, hynix, kakao];
    const prices = makePrices([
      [samsung, 70000],
      [hynix, 120000],
      [kakao, 45000],
    ]);

    it("priceDesc orders by close price descending", () => {
      const result = sortHoldings(holdings, prices, "priceDesc");
      expect(result.map((h) => h.ticker)).toEqual(["000660", "005930", "035720"]);
    });

    it("priceAsc orders by close price ascending", () => {
      const result = sortHoldings(holdings, prices, "priceAsc");
      expect(result.map((h) => h.ticker)).toEqual(["035720", "005930", "000660"]);
    });

    it("does not mutate the input array", () => {
      const original = [...holdings];
      sortHoldings(holdings, prices, "priceDesc");
      expect(holdings).toEqual(original);
    });
  });

  describe("evaluation sort (price * quantity)", () => {
    const a = makeHolding({ id: 1, ticker: "A", quantity: 10 }); // 10 * 5000 = 50,000
    const b = makeHolding({ id: 2, ticker: "B", quantity: 1 }); // 1 * 100000 = 100,000
    const c = makeHolding({ id: 3, ticker: "C", quantity: 50 }); // 50 * 2000 = 100,000
    const d = makeHolding({ id: 4, ticker: "D", quantity: 3 }); // 3 * 1000 = 3,000
    const holdings = [a, b, c, d];
    const prices = makePrices([
      [a, 5000],
      [b, 100000],
      [c, 2000],
      [d, 1000],
    ]);

    it("evalDesc orders by price * quantity descending", () => {
      const result = sortHoldings(holdings, prices, "evalDesc");
      // b and c tie at 100,000 → their relative order preserved from input (b before c)
      expect(result.map((h) => h.ticker)).toEqual(["B", "C", "A", "D"]);
    });

    it("evalAsc orders by price * quantity ascending", () => {
      const result = sortHoldings(holdings, prices, "evalAsc");
      expect(result.map((h) => h.ticker)).toEqual(["D", "A", "B", "C"]);
    });

    it("treats zero quantity as zero evaluation (sorted as the lowest value)", () => {
      const zero = makeHolding({ id: 5, ticker: "Z", quantity: 0 });
      const withZero = [a, zero];
      const p = makePrices([
        [a, 5000],
        [zero, 9999999],
      ]);

      const result = sortHoldings(withZero, p, "evalAsc");
      expect(result.map((h) => h.ticker)).toEqual(["Z", "A"]);
    });
  });

  describe("missing price data", () => {
    it("pushes holdings without price to the end regardless of direction", () => {
      const withPrice = makeHolding({ id: 1, ticker: "A", quantity: 10 });
      const missing = makeHolding({ id: 2, ticker: "B", quantity: 10 });
      const holdings = [missing, withPrice];
      const prices = makePrices([[withPrice, 1000]]);

      const desc = sortHoldings(holdings, prices, "priceDesc");
      expect(desc.map((h) => h.ticker)).toEqual(["A", "B"]);

      const asc = sortHoldings(holdings, prices, "priceAsc");
      expect(asc.map((h) => h.ticker)).toEqual(["A", "B"]);
    });

    it("pushes holdings with empty market/ticker to the end", () => {
      const legacy: StockHolding = {
        id: 1,
        market: "",
        ticker: "",
        name: "legacy",
        currency: "",
        quantity: 10,
        memo: "",
      };
      const normal = makeHolding({ id: 2, ticker: "A", quantity: 5 });
      const prices = makePrices([[normal, 1000]]);

      const result = sortHoldings([legacy, normal], prices, "priceDesc");
      expect(result.map((h) => h.id)).toEqual([2, 1]);
    });

    it("preserves relative order among holdings that all lack prices", () => {
      const a = makeHolding({ id: 1, ticker: "A" });
      const b = makeHolding({ id: 2, ticker: "B" });
      const c = makeHolding({ id: 3, ticker: "C" });
      const prices: Map<string, SortPricePoint> = new Map();

      const result = sortHoldings([a, b, c], prices, "priceAsc");
      expect(result.map((h) => h.ticker)).toEqual(["A", "B", "C"]);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty input", () => {
      const result = sortHoldings([], new Map(), "priceDesc");
      expect(result).toEqual([]);
    });

    it("returns single-item array unchanged", () => {
      const only = makeHolding({ id: 1, ticker: "A", quantity: 5 });
      const prices = makePrices([[only, 1000]]);
      const result = sortHoldings([only], prices, "evalDesc");
      expect(result).toEqual([only]);
    });
  });
});
