import type { StockPricePoint } from "@mobile/features/investments/utils/use-stock-prices";
import { describe, expect, it } from "vitest";
import { findUnpricedStocks, rebalancingStartBlock, type UnpricedStock } from "./start-block";

const A = { market: "KOSPI", ticker: "A", name: "에이" };
const B = { market: "KOSPI", ticker: "B", name: "" };

function point(close: number): StockPricePoint {
  return { close, date: "2026-11-25", asOf: "2026-11-25T06:30:00.000Z", kind: "close" };
}
const EMPTY = { entries: {}, errors: {} };

describe("findUnpricedStocks", () => {
  it("시세를 모두 알면 비어 있다", () => {
    const cache = { entries: { "KOSPI:A": { point: point(100), fetchedAt: 0 } }, errors: {} };
    expect(findUnpricedStocks([A], cache)).toEqual([]);
  });

  it("아직 받은 적 없는 종목은 loading", () => {
    expect(findUnpricedStocks([A], EMPTY)).toEqual([
      { key: "KOSPI:A", name: "에이", reason: "loading" },
    ]);
  });

  it("요청이 실패해 받은 적 없는 종목은 failed", () => {
    const cache = { entries: {}, errors: { "KOSPI:A": "offline" } };
    expect(findUnpricedStocks([A], cache)[0]?.reason).toBe("failed");
  });

  it("서버에 시세가 없는 종목은 missing 이고 이름이 없으면 티커로 부른다", () => {
    const cache = { entries: { "KOSPI:B": { point: null, fetchedAt: 0 } }, errors: {} };
    expect(findUnpricedStocks([B], cache)).toEqual([
      { key: "KOSPI:B", name: "B", reason: "missing" },
    ]);
  });

  it("시세 없음으로 캐시된 종목을 다시 묻다 실패하면 failed", () => {
    const cache = {
      entries: { "KOSPI:A": { point: null, fetchedAt: 0 } },
      errors: { "KOSPI:A": "offline" },
    };
    expect(findUnpricedStocks([A], cache)[0]?.reason).toBe("failed");
  });

  it("갱신에 실패해도 예전에 받은 시세가 있으면 안다고 본다", () => {
    const cache = {
      entries: { "KOSPI:A": { point: point(100), fetchedAt: 0 } },
      errors: { "KOSPI:A": "offline" },
    };
    expect(findUnpricedStocks([A], cache)).toEqual([]);
  });

  it("가격이 0원이면 시세를 모르는 것으로 본다", () => {
    const cache = { entries: { "KOSPI:A": { point: point(0), fetchedAt: 0 } }, errors: {} };
    expect(findUnpricedStocks([A], cache)[0]?.reason).toBe("missing");
  });

  it("종목을 고르지 않은 항목은 요청하지 않으므로 바로 missing", () => {
    const blank = { market: "", ticker: "", name: "" };
    expect(findUnpricedStocks([blank], EMPTY)).toEqual([
      { key: ":", name: "(미선택)", reason: "missing" },
    ]);
  });

  it("같은 종목이 두 번 있어도 한 번만 센다", () => {
    expect(findUnpricedStocks([A, A], EMPTY)).toHaveLength(1);
  });
});

describe("rebalancingStartBlock", () => {
  const stock = (reason: UnpricedStock["reason"]): UnpricedStock => ({
    key: reason,
    name: reason,
    reason,
  });
  const ok = { hasOutsideHoldings: false, unpriced: [], taskCount: 2 };

  it("막을 이유가 없으면 null", () => {
    expect(rebalancingStartBlock(ok)).toBeNull();
  });

  it.each([
    ["loading", "prices-loading"],
    ["failed", "prices-failed"],
    ["missing", "prices-missing"],
  ] as const)("시세가 %s 이면 %s 로 막는다", (reason, expected) => {
    expect(rebalancingStartBlock({ ...ok, unpriced: [stock(reason)] })).toBe(expected);
  });

  it("여러 이유가 섞이면 계속 모르는 종목 → 실패 → 불러오는 중 순으로 알린다", () => {
    expect(rebalancingStartBlock({ ...ok, unpriced: [stock("loading"), stock("failed")] })).toBe(
      "prices-failed"
    );
    expect(rebalancingStartBlock({ ...ok, unpriced: [stock("failed"), stock("missing")] })).toBe(
      "prices-missing"
    );
  });

  it("포트폴리오 밖 종목이 시세보다 먼저다", () => {
    expect(
      rebalancingStartBlock({ ...ok, hasOutsideHoldings: true, unpriced: [stock("missing")] })
    ).toBe("outside-holdings");
  });

  it("시세를 모르면 매매가 없어도 시세를 이유로 든다", () => {
    expect(rebalancingStartBlock({ ...ok, taskCount: 0, unpriced: [stock("failed")] })).toBe(
      "prices-failed"
    );
  });

  it("사고팔 종목이 없으면 no-trades", () => {
    expect(rebalancingStartBlock({ ...ok, taskCount: 0 })).toBe("no-trades");
  });
});
