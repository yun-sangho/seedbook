import { describe, expect, it } from "vitest";
import { chunk, parseNaverRealtime } from "./naver-realtime";

// polling.finance.naver.com/api/realtime/domestic/stock/<codes> 응답에서 쓰는 필드만 남긴 것.
function naverItem(overrides: Record<string, unknown> = {}) {
  return {
    itemCode: "005930",
    closePriceRaw: "193500",
    marketStatus: "OPEN",
    localTradedAt: "2026-11-09T10:31:12+09:00",
    ...overrides,
  };
}

describe("parseNaverRealtime", () => {
  it("parses price, market status and trade time", () => {
    const result = parseNaverRealtime({ datas: [naverItem()] });
    expect(result).toEqual([
      {
        ticker: "005930",
        price: 193500,
        marketStatus: "OPEN",
        tradedAt: new Date("2026-11-09T01:31:12.000Z"),
      },
    ]);
  });

  it("returns an empty list when datas is missing", () => {
    expect(parseNaverRealtime({})).toEqual([]);
  });

  it("returns an empty list for a non-object body", () => {
    expect(parseNaverRealtime(null)).toEqual([]);
  });

  it("skips items whose price is not a positive number", () => {
    const result = parseNaverRealtime({
      datas: [naverItem({ closePriceRaw: "-" }), naverItem({ itemCode: "000660" })],
    });
    expect(result.map((q) => q.ticker)).toEqual(["000660"]);
  });

  it("skips items with an unparseable trade time", () => {
    const result = parseNaverRealtime({ datas: [naverItem({ localTradedAt: "not-a-date" })] });
    expect(result).toEqual([]);
  });
});

describe("chunk", () => {
  it("splits a list into groups of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns no groups for an empty list", () => {
    expect(chunk([], 3)).toEqual([]);
  });
});
