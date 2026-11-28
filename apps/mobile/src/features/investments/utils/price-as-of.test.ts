import { describe, expect, it } from "vitest";
import { describePriceAsOf, summarizePriceAsOf } from "./price-as-of";
import type { StockPricePoint } from "./use-stock-prices";

const kst = (dateTime: string) => new Date(`${dateTime}+09:00`);

function realtime(dateTime: string, close = 1000): StockPricePoint {
  return {
    close,
    date: dateTime.slice(0, 10),
    asOf: kst(dateTime).toISOString(),
    kind: "realtime",
  };
}

function dailyClose(date: string, close = 1000): StockPricePoint {
  return { close, date, asOf: kst(`${date}T15:30:00`).toISOString(), kind: "close" };
}

describe("summarizePriceAsOf", () => {
  it("returns null when there are no prices", () => {
    expect(summarizePriceAsOf([])).toBeNull();
  });

  it("uses the most recent price as the reference", () => {
    const result = summarizePriceAsOf([
      realtime("2026-11-09T10:30:00"),
      realtime("2026-11-09T10:31:00"),
    ]);
    expect(result).toMatchObject({
      asOf: kst("2026-11-09T10:31:00").toISOString(),
      kind: "realtime",
    });
  });

  it("does not flag prices a few minutes apart as lagging", () => {
    const result = summarizePriceAsOf([
      realtime("2026-11-09T10:25:00"),
      realtime("2026-11-09T10:31:00"),
    ]);
    expect(result?.hasLagging).toBe(false);
  });

  it("flags a holding still on the previous close while others are realtime", () => {
    const result = summarizePriceAsOf([dailyClose("2026-11-06"), realtime("2026-11-09T10:31:00")]);
    expect(result?.hasLagging).toBe(true);
  });

  it("does not flag closes from the same day as lagging", () => {
    const result = summarizePriceAsOf([dailyClose("2026-11-06"), dailyClose("2026-11-06", 2000)]);
    expect(result?.hasLagging).toBe(false);
  });
});

describe("describePriceAsOf", () => {
  const now = kst("2026-11-09T10:32:00");

  it("labels a realtime price from today with today's trade time", () => {
    const summary = summarizePriceAsOf([realtime("2026-11-09T10:31:00")])!;
    expect(describePriceAsOf(summary, now).title).toBe("오늘 10:31 기준");
  });

  it("labels a realtime price from an earlier day with its date", () => {
    const summary = summarizePriceAsOf([realtime("2026-11-06T14:05:00")])!;
    expect(describePriceAsOf(summary, now).title).toBe("11월 6일 (금) 14:05 기준");
  });

  it("labels a closing price with its trading day", () => {
    const summary = summarizePriceAsOf([dailyClose("2026-11-06")])!;
    expect(describePriceAsOf(summary, now).title).toBe("11월 6일 (금) 종가 기준");
  });

  it("labels today's closing price as today", () => {
    const summary = summarizePriceAsOf([dailyClose("2026-11-09")])!;
    expect(describePriceAsOf(summary, kst("2026-11-09T16:00:00")).title).toBe("오늘 종가 기준");
  });

  it("uses the informative tone for realtime prices and neutral for closes", () => {
    const live = summarizePriceAsOf([realtime("2026-11-09T10:31:00")])!;
    const closed = summarizePriceAsOf([dailyClose("2026-11-06")])!;
    expect(describePriceAsOf(live, now).tone).toBe("informative");
    expect(describePriceAsOf(closed, now).tone).toBe("neutral");
  });

  it("explains when some holdings are on an older price", () => {
    const summary = summarizePriceAsOf([
      dailyClose("2026-11-06"),
      realtime("2026-11-09T10:31:00"),
    ])!;
    expect(describePriceAsOf(summary, now).description).toBe("일부 종목은 이전 시세로 계산했어요");
  });

  it("has no description when every holding shares the same reference", () => {
    const summary = summarizePriceAsOf([dailyClose("2026-11-06")])!;
    expect(describePriceAsOf(summary, now).description).toBeUndefined();
  });
});
