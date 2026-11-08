import { describe, expect, it } from "vitest";
import { isKrxTradingHours, isQuoteStale, pickPricePoint } from "./quote-policy";

// 2026-11-09 (월) 기준 KST 시각을 만든다.
const kst = (time: string, day = "2026-11-09") => new Date(`${day}T${time}+09:00`);

describe("isKrxTradingHours", () => {
  it("is true at 10:00 KST on a weekday", () => {
    expect(isKrxTradingHours(kst("10:00:00"))).toBe(true);
  });

  it("is false before 09:00 KST", () => {
    expect(isKrxTradingHours(kst("08:59:00"))).toBe(false);
  });

  it("stays true a few minutes after 15:30 so the closing price is captured", () => {
    expect(isKrxTradingHours(kst("15:35:00"))).toBe(true);
  });

  it("is false after 15:40 KST", () => {
    expect(isKrxTradingHours(kst("15:40:00"))).toBe(false);
  });

  it("is false on a Saturday", () => {
    expect(isKrxTradingHours(kst("10:00:00", "2026-11-07"))).toBe(false);
  });
});

describe("isQuoteStale", () => {
  it("treats a missing quote as stale", () => {
    expect(isQuoteStale(null, kst("10:00:00"))).toBe(true);
  });

  it("keeps a 30 second old quote during trading hours", () => {
    expect(isQuoteStale({ fetchedAt: kst("09:59:30") }, kst("10:00:00"))).toBe(false);
  });

  it("refreshes a 2 minute old quote during trading hours", () => {
    expect(isQuoteStale({ fetchedAt: kst("09:58:00") }, kst("10:00:00"))).toBe(true);
  });

  it("keeps a 10 minute old quote outside trading hours", () => {
    expect(isQuoteStale({ fetchedAt: kst("20:00:00") }, kst("20:10:00"))).toBe(false);
  });

  it("refreshes a 1 hour old quote outside trading hours", () => {
    expect(isQuoteStale({ fetchedAt: kst("19:00:00") }, kst("20:00:00"))).toBe(true);
  });
});

describe("pickPricePoint", () => {
  it("returns null when there is neither a daily close nor a quote", () => {
    expect(pickPricePoint(null, null)).toBeNull();
  });

  it("uses the daily close with a 15:30 KST timestamp when there is no quote", () => {
    const result = pickPricePoint({ date: "2026-11-06", close: 70000 }, null);
    expect(result).toEqual({
      close: 70000,
      date: "2026-11-06",
      asOf: "2026-11-06T06:30:00.000Z",
      kind: "close",
    });
  });

  it("uses an open-market quote as a realtime price stamped with its trade time", () => {
    const result = pickPricePoint(
      { date: "2026-11-06", close: 70000 },
      { price: 71200, marketStatus: "OPEN", tradedAt: kst("10:31:12") }
    );
    expect(result).toEqual({
      close: 71200,
      date: "2026-11-09",
      asOf: kst("10:31:12").toISOString(),
      kind: "realtime",
    });
  });

  it("uses a closed-market quote from a newer day as that day's close", () => {
    // 15:30 장 마감 ~ 16:30 일봉 수집 사이: 오늘 종가는 quote 에만 있다.
    const result = pickPricePoint(
      { date: "2026-11-06", close: 70000 },
      { price: 71500, marketStatus: "CLOSE", tradedAt: kst("15:30:00") }
    );
    expect(result).toEqual({
      close: 71500,
      date: "2026-11-09",
      asOf: "2026-11-09T06:30:00.000Z",
      kind: "close",
    });
  });

  it("labels an after-market closed quote with the 15:30 close time, not the trade time", () => {
    // 네이버는 장 마감 후에도 시간외 거래 시각 (예: 20:00) 을 tradedAt 으로 준다.
    const result = pickPricePoint(null, {
      price: 71500,
      marketStatus: "CLOSE",
      tradedAt: kst("20:00:00"),
    });
    expect(result?.asOf).toBe("2026-11-09T06:30:00.000Z");
  });

  it("prefers the confirmed daily close when a closed quote is from the same day", () => {
    const result = pickPricePoint(
      { date: "2026-11-09", close: 71400 },
      { price: 71500, marketStatus: "CLOSE", tradedAt: kst("20:00:00") }
    );
    expect(result?.close).toBe(71400);
  });

  it("prefers a newer daily close over an old open-market quote that stopped refreshing", () => {
    const result = pickPricePoint(
      { date: "2026-11-09", close: 71400 },
      { price: 70100, marketStatus: "OPEN", tradedAt: kst("11:00:00", "2026-11-06") }
    );
    expect(result).toMatchObject({ close: 71400, date: "2026-11-09", kind: "close" });
  });
});
