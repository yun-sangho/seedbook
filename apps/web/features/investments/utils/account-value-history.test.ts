import { describe, expect, it } from "vitest";
import type { InvestmentItem } from "../types/types";
import {
  type AccountValueSnapshot,
  appendHoldingsEntry,
  computeMissingSnapshots,
  type DailyClose,
  fillRange,
  type HoldingsEntry,
  mergeSnapshots,
  projectHoldings,
  symbolsInRange,
} from "./account-value-history";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";

function investment(
  id: string,
  holdings: Array<[market: string, ticker: string, quantity: number]>,
  cash: number[]
): Pick<InvestmentItem, "id" | "holdings" | "cashItems"> {
  return {
    id,
    holdings: holdings.map(([market, ticker, quantity], i) => ({
      id: `${id}-h${i}`,
      market,
      ticker,
      name: ticker,
      currency: "KRW",
      quantity,
      memo: "",
    })),
    cashItems: cash.map((amount, i) => ({ id: `${id}-c${i}`, label: "예수금", amount })),
  };
}

function series(...points: Array<[date: string, close: number]>): DailyClose[] {
  return points.map(([date, close]) => ({ date, close }));
}

const SAMSUNG = "KOSPI:005930";
const KAKAO = "KOSDAQ:035720";

function totals(snapshots: AccountValueSnapshot[]) {
  return snapshots.map((s) => [s.accountId, s.date, s.totalValue]);
}

describe("projectHoldings", () => {
  it("keeps only holdings with a ticker, in a stable order", () => {
    const projected = projectHoldings([
      investment(
        ACCOUNT_A,
        [
          ["KOSPI", "005930", 3],
          ["", "", 5],
          ["KOSDAQ", "035720", 2],
        ],
        [100, -20]
      ),
    ]);

    expect(projected).toEqual({
      [ACCOUNT_A]: {
        holdings: [
          { market: "KOSDAQ", ticker: "035720", quantity: 2 },
          { market: "KOSPI", ticker: "005930", quantity: 3 },
        ],
        cash: [-20, 100],
      },
    });
  });
});

describe("appendHoldingsEntry", () => {
  const a = projectHoldings([investment(ACCOUNT_A, [["KOSPI", "005930", 3]], [0])]);
  const b = projectHoldings([investment(ACCOUNT_A, [["KOSPI", "005930", 4]], [0])]);

  it("starts the history with the first holdings", () => {
    expect(appendHoldingsEntry([], a, "2026-11-24")).toEqual([{ date: "2026-11-24", accounts: a }]);
  });

  it("returns null when the holdings did not change", () => {
    const reordered = projectHoldings([investment(ACCOUNT_A, [["KOSPI", "005930", 3]], [0])]);
    expect(
      appendHoldingsEntry([{ date: "2026-11-24", accounts: a }], reordered, "2026-11-25")
    ).toBe(null);
  });

  it("adds an entry on a later day", () => {
    expect(appendHoldingsEntry([{ date: "2026-11-24", accounts: a }], b, "2026-11-25")).toEqual([
      { date: "2026-11-24", accounts: a },
      { date: "2026-11-25", accounts: b },
    ]);
  });

  it("replaces the entry of the same day — the last holdings of a day count", () => {
    expect(appendHoldingsEntry([{ date: "2026-11-25", accounts: a }], b, "2026-11-25")).toEqual([
      { date: "2026-11-25", accounts: b },
    ]);
  });

  it("records a stop marker so a cloud-mode period is never filled", () => {
    expect(appendHoldingsEntry([{ date: "2026-11-24", accounts: a }], null, "2026-11-26")).toEqual([
      { date: "2026-11-24", accounts: a },
      { date: "2026-11-26", accounts: null },
    ]);
  });

  it("does not start a history with a stop marker", () => {
    expect(appendHoldingsEntry([], null, "2026-11-26")).toBe(null);
  });
});

describe("fillRange", () => {
  const entries: HoldingsEntry[] = [{ date: "2026-11-20", accounts: {} }];

  it("starts at the first entry and ends yesterday — today's close is not final yet", () => {
    expect(fillRange(entries, [], "2026-11-27")).toEqual({ from: "2026-11-20", to: "2026-11-26" });
  });

  it("continues after the last recorded day", () => {
    const recorded = [{ accountId: ACCOUNT_A, date: "2026-11-24" } as AccountValueSnapshot];
    expect(fillRange(entries, recorded, "2026-11-27")).toEqual({
      from: "2026-11-25",
      to: "2026-11-26",
    });
  });

  it("does not fill before the history began, even if older snapshots exist", () => {
    const recorded = [{ accountId: ACCOUNT_A, date: "2026-10-01" } as AccountValueSnapshot];
    expect(fillRange(entries, recorded, "2026-11-27")).toEqual({
      from: "2026-11-20",
      to: "2026-11-26",
    });
  });

  it("is null when there is no history or nothing is missing", () => {
    expect(fillRange([], [], "2026-11-27")).toBe(null);
    expect(fillRange([{ date: "2026-11-27", accounts: {} }], [], "2026-11-27")).toBe(null);
  });
});

describe("symbolsInRange", () => {
  it("lists the stocks held at any point of the range, including the entry before it", () => {
    const entries: HoldingsEntry[] = [
      {
        date: "2026-11-01",
        accounts: { [ACCOUNT_A]: { holdings: [h("KOSPI", "1", 1)], cash: [] } },
      },
      {
        date: "2026-11-10",
        accounts: { [ACCOUNT_A]: { holdings: [h("KOSPI", "2", 1)], cash: [] } },
      },
      {
        date: "2026-11-21",
        accounts: { [ACCOUNT_A]: { holdings: [h("KOSPI", "3", 1)], cash: [] } },
      },
      {
        date: "2026-11-30",
        accounts: { [ACCOUNT_A]: { holdings: [h("KOSPI", "4", 1)], cash: [] } },
      },
    ];

    expect(symbolsInRange(entries, { from: "2026-11-05", to: "2026-11-25" })).toEqual([
      { market: "KOSPI", ticker: "1" },
      { market: "KOSPI", ticker: "2" },
      { market: "KOSPI", ticker: "3" },
    ]);
  });
});

function h(market: string, ticker: string, quantity: number) {
  return { market, ticker, quantity };
}

describe("computeMissingSnapshots", () => {
  // 2026-11-23 월 … 2026-11-27 금, 2026-11-28 토, 2026-11-29 일, 2026-11-30 월
  const prices = new Map<string, DailyClose[]>([
    [SAMSUNG, series(["2026-11-20", 69_000], ["2026-11-23", 70_000], ["2026-11-24", 71_000])],
    [KAKAO, series(["2026-11-23", 40_000])],
  ]);

  function entry(date: string, accounts: HoldingsEntry["accounts"]): HoldingsEntry {
    return { date, accounts };
  }

  it("values each weekday with that day's close", () => {
    const entries = [
      entry("2026-11-23", { [ACCOUNT_A]: { holdings: [h("KOSPI", "005930", 2)], cash: [1_000] } }),
    ];

    const snapshots = computeMissingSnapshots(
      entries,
      { from: "2026-11-23", to: "2026-11-24" },
      prices
    );

    expect(snapshots).toEqual([
      {
        accountId: ACCOUNT_A,
        date: "2026-11-23",
        stockValue: 140_000,
        cashValue: 1_000,
        totalValue: 141_000,
        holdingCount: 1,
        missingPriceCount: 0,
        oldestPriceDate: "2026-11-23",
      },
      {
        accountId: ACCOUNT_A,
        date: "2026-11-24",
        stockValue: 142_000,
        cashValue: 1_000,
        totalValue: 143_000,
        holdingCount: 1,
        missingPriceCount: 0,
        oldestPriceDate: "2026-11-24",
      },
    ]);
  });

  it("falls back to the latest earlier close when the day has none", () => {
    const entries = [
      entry("2026-11-23", { [ACCOUNT_A]: { holdings: [h("KOSDAQ", "035720", 1)], cash: [] } }),
    ];

    const [snapshot] = computeMissingSnapshots(
      entries,
      { from: "2026-11-25", to: "2026-11-25" },
      prices
    );

    expect(snapshot).toMatchObject({ totalValue: 40_000, oldestPriceDate: "2026-11-23" });
  });

  it("skips weekends", () => {
    const entries = [entry("2026-11-27", { [ACCOUNT_A]: { holdings: [], cash: [500] } })];

    const snapshots = computeMissingSnapshots(
      entries,
      { from: "2026-11-27", to: "2026-11-30" },
      prices
    );

    expect(snapshots.map((s) => s.date)).toEqual(["2026-11-27", "2026-11-30"]);
  });

  it("values an account with no holdings and no cash at 0", () => {
    const entries = [entry("2026-11-23", { [ACCOUNT_A]: { holdings: [], cash: [] } })];

    const [snapshot] = computeMissingSnapshots(
      entries,
      { from: "2026-11-23", to: "2026-11-23" },
      prices
    );

    expect(snapshot).toMatchObject({ totalValue: 0, holdingCount: 0, oldestPriceDate: null });
  });

  it("values a cash-only account at its cash", () => {
    const entries = [
      entry("2026-11-23", { [ACCOUNT_A]: { holdings: [], cash: [300_000, 200_000] } }),
    ];

    const [snapshot] = computeMissingSnapshots(
      entries,
      { from: "2026-11-23", to: "2026-11-23" },
      new Map()
    );

    expect(snapshot).toMatchObject({ stockValue: 0, cashValue: 500_000, totalValue: 500_000 });
  });

  it("subtracts negative cash", () => {
    const entries = [
      entry("2026-11-23", {
        [ACCOUNT_A]: { holdings: [h("KOSPI", "005930", 1)], cash: [-30_000] },
      }),
    ];

    const [snapshot] = computeMissingSnapshots(
      entries,
      { from: "2026-11-23", to: "2026-11-23" },
      prices
    );

    expect(snapshot).toMatchObject({ stockValue: 70_000, cashValue: -30_000, totalValue: 40_000 });
  });

  it("leaves out stocks without any close and counts them as missing", () => {
    const entries = [
      entry("2026-11-23", {
        [ACCOUNT_A]: { holdings: [h("KOSPI", "005930", 1), h("KOSPI", "999999", 10)], cash: [] },
      }),
    ];

    const [snapshot] = computeMissingSnapshots(
      entries,
      { from: "2026-11-23", to: "2026-11-23" },
      prices
    );

    expect(snapshot).toMatchObject({ totalValue: 70_000, holdingCount: 2, missingPriceCount: 1 });
  });

  it("does not use a close from after the day", () => {
    const entries = [
      entry("2026-11-19", { [ACCOUNT_A]: { holdings: [h("KOSDAQ", "035720", 1)], cash: [] } }),
    ];

    const [snapshot] = computeMissingSnapshots(
      entries,
      { from: "2026-11-20", to: "2026-11-20" },
      prices
    );

    expect(snapshot).toMatchObject({ totalValue: 0, missingPriceCount: 1 });
  });

  it("uses the holdings in effect on each day when they change midway", () => {
    const entries = [
      entry("2026-11-20", { [ACCOUNT_A]: { holdings: [h("KOSPI", "005930", 1)], cash: [] } }),
      // 토요일에 바꾼 보유는 다음 거래일부터 쓴다.
      entry("2026-11-22", {
        [ACCOUNT_A]: { holdings: [h("KOSPI", "005930", 3)], cash: [] },
        [ACCOUNT_B]: { holdings: [], cash: [10] },
      }),
      // 계좌 A 를 지웠다.
      entry("2026-11-24", { [ACCOUNT_B]: { holdings: [], cash: [10] } }),
    ];

    const snapshots = computeMissingSnapshots(
      entries,
      { from: "2026-11-20", to: "2026-11-24" },
      prices
    );

    expect(totals(snapshots)).toEqual([
      [ACCOUNT_A, "2026-11-20", 69_000],
      [ACCOUNT_A, "2026-11-23", 210_000],
      [ACCOUNT_B, "2026-11-23", 10],
      [ACCOUNT_B, "2026-11-24", 10],
    ]);
  });

  it("fills nothing while recording was stopped (cloud mode)", () => {
    const entries = [
      entry("2026-11-20", { [ACCOUNT_A]: { holdings: [], cash: [1] } }),
      entry("2026-11-23", null),
      entry("2026-11-26", { [ACCOUNT_A]: { holdings: [], cash: [2] } }),
    ];

    const snapshots = computeMissingSnapshots(
      entries,
      { from: "2026-11-20", to: "2026-11-26" },
      prices
    );

    expect(totals(snapshots)).toEqual([
      [ACCOUNT_A, "2026-11-20", 1],
      [ACCOUNT_A, "2026-11-26", 2],
    ]);
  });

  it("fills every weekday of a long absence", () => {
    const entries = [
      entry("2026-01-05", { [ACCOUNT_A]: { holdings: [h("KOSPI", "005930", 1)], cash: [] } }),
    ];

    const snapshots = computeMissingSnapshots(
      entries,
      { from: "2026-01-05", to: "2026-11-26" },
      prices
    );

    // 2026-01-05(월) ~ 2026-11-26(목): 46주 + 4일
    expect(snapshots).toHaveLength(46 * 5 + 4);
    expect(snapshots.at(-1)).toMatchObject({ date: "2026-11-26", totalValue: 71_000 });
    expect(snapshots[0]).toMatchObject({ date: "2026-01-05", totalValue: 0, missingPriceCount: 1 });
  });
});

describe("mergeSnapshots", () => {
  const snap = (accountId: string, date: string, totalValue: number) =>
    ({ accountId, date, totalValue }) as AccountValueSnapshot;

  it("unions both and keeps the preferred side for the same account and day", () => {
    const merged = mergeSnapshots(
      [snap(ACCOUNT_A, "2026-11-24", 1), snap(ACCOUNT_A, "2026-11-25", 2)],
      [
        snap(ACCOUNT_A, "2026-11-23", 9),
        snap(ACCOUNT_A, "2026-11-25", 9),
        snap(ACCOUNT_B, "2026-11-25", 9),
      ]
    );

    expect(totals(merged)).toEqual([
      [ACCOUNT_A, "2026-11-23", 9],
      [ACCOUNT_A, "2026-11-24", 1],
      [ACCOUNT_A, "2026-11-25", 2],
      [ACCOUNT_B, "2026-11-25", 9],
    ]);
  });
});
