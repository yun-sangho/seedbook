import { describe, expect, it } from "vitest";
import type { StockHolding } from "../types/types";
import {
  DEFAULT_HOLDINGS_SORT_OPTION,
  normalizeHoldingsSortOption,
  sortByHoldingsOption,
  sortHoldings,
  type SortPricePoint,
} from "./sort-holdings";
import { stockPriceKey } from "./use-stock-prices";

// 테스트 편의상 숫자 id 를 받아 내부에서 문자열로 변환한다. 실제 StockHolding.id
// 는 UUID string 타입이지만 테스트 assertion 이 숫자 시퀀스로 더 읽기 쉬우므로
// 입력은 number 로 유지.
function makeHolding(overrides: Omit<Partial<StockHolding>, "id"> & { id: number }): StockHolding {
  return {
    id: String(overrides.id),
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
  describe("name sort", () => {
    const holdings = [
      makeHolding({ id: 1, name: "카카오" }),
      makeHolding({ id: 2, name: "삼성전자" }),
      makeHolding({ id: 3, name: "KODEX 200" }),
      makeHolding({ id: 4, name: "NAVER" }),
    ];

    it("nameAsc orders by name in Korean order, Hangul (가나다) before Latin", () => {
      const result = sortHoldings(holdings, new Map(), "nameAsc");
      expect(result.map((h) => h.name)).toEqual(["삼성전자", "카카오", "KODEX 200", "NAVER"]);
    });

    it("nameDesc orders by name in reverse", () => {
      const result = sortHoldings(holdings, new Map(), "nameDesc");
      expect(result.map((h) => h.name)).toEqual(["NAVER", "KODEX 200", "카카오", "삼성전자"]);
    });

    it("sorts by name even when prices are missing", () => {
      const result = sortHoldings(holdings.slice(0, 2), new Map(), "nameAsc");
      expect(result.map((h) => h.name)).toEqual(["삼성전자", "카카오"]);
    });

    it("falls back to the ticker for a holding without a name", () => {
      const unnamed = makeHolding({ id: 5, name: "", ticker: "A00001" });
      const result = sortHoldings(
        [unnamed, makeHolding({ id: 6, name: "B" })],
        new Map(),
        "nameAsc"
      );
      expect(result.map((h) => h.id)).toEqual(["5", "6"]);
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
        id: "1",
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
      expect(result.map((h) => h.id)).toEqual(["2", "1"]);
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

describe("sortByHoldingsOption", () => {
  // 홈 "종목" 탭의 합산 종목처럼 가격·평가액을 이미 계산한 목록.
  const rows = [
    { name: "카카오", price: 40_000, value: 400_000 },
    { name: "삼성전자", price: 70_000, value: 700_000 },
    { name: "시세없음", price: null, value: null },
  ];

  it("sorts precomputed rows by value with unpriced rows last", () => {
    const result = sortByHoldingsOption(rows, "evalDesc", (r) => r);
    expect(result.map((r) => r.name)).toEqual(["삼성전자", "카카오", "시세없음"]);
  });

  it("sorts precomputed rows by name", () => {
    const result = sortByHoldingsOption(rows, "nameAsc", (r) => r);
    expect(result.map((r) => r.name)).toEqual(["삼성전자", "시세없음", "카카오"]);
  });
});

describe("normalizeHoldingsSortOption", () => {
  it("keeps a known option", () => {
    expect(normalizeHoldingsSortOption("nameDesc")).toBe("nameDesc");
  });

  it("replaces the removed 'default' option with the default sort", () => {
    expect(normalizeHoldingsSortOption("default")).toBe(DEFAULT_HOLDINGS_SORT_OPTION);
  });

  it("replaces a missing or unknown value with the default sort", () => {
    expect(normalizeHoldingsSortOption(undefined)).toBe(DEFAULT_HOLDINGS_SORT_OPTION);
    expect(normalizeHoldingsSortOption("value")).toBe(DEFAULT_HOLDINGS_SORT_OPTION);
  });

  it("defaults to the highest evaluated value first", () => {
    expect(DEFAULT_HOLDINGS_SORT_OPTION).toBe("evalDesc");
  });
});
