import { describe, expect, it } from "vitest";
import type { PortfolioStockRow } from "./portfolio-stock-rows";
import { sortPortfolioStockRows } from "./sort-portfolio-stock-rows";

function row(
  key: string,
  overrides: Partial<Omit<PortfolioStockRow, "key">> = {}
): PortfolioStockRow {
  return {
    key,
    market: "KOSPI",
    ticker: key,
    name: key,
    value: 0,
    percent: 0,
    targetPercent: 10,
    ...overrides,
  };
}

const keys = (rows: PortfolioStockRow[]) => rows.map((r) => r.key);

describe("sortPortfolioStockRows", () => {
  it("puts the largest drift first, whichever direction it goes (relative)", () => {
    const rows = [
      row("over", { targetPercent: 20, percent: 25 }), // +25%
      row("under", { targetPercent: 10, percent: 1 }), // -90%
      row("even", { targetPercent: 30, percent: 30 }), // 0%
    ];

    expect(keys(sortPortfolioStockRows(rows, "driftDesc", "relative"))).toEqual([
      "under",
      "over",
      "even",
    ]);
  });

  it("ranks drift by %p in absolute mode", () => {
    const rows = [
      row("small-target", { targetPercent: 10, percent: 1 }), // -9%p (-90%)
      row("big-target", { targetPercent: 50, percent: 38 }), // -12%p (-24%)
    ];

    expect(keys(sortPortfolioStockRows(rows, "driftDesc", "absolute"))).toEqual([
      "big-target",
      "small-target",
    ]);
  });

  it("ranks a holding outside the target by its own weight", () => {
    const rows = [
      row("target", { targetPercent: 20, percent: 22 }), // +10%
      row("outside", { targetPercent: null, percent: 15 }), // 목표 0 → +15
    ];

    expect(keys(sortPortfolioStockRows(rows, "driftDesc", "relative"))).toEqual([
      "outside",
      "target",
    ]);
  });

  it("sorts by value in both directions", () => {
    const rows = [
      row("mid", { value: 200 }),
      row("low", { value: 100 }),
      row("high", { value: 300 }),
    ];

    expect(keys(sortPortfolioStockRows(rows, "evalDesc", "relative"))).toEqual([
      "high",
      "mid",
      "low",
    ]);
    expect(keys(sortPortfolioStockRows(rows, "evalAsc", "relative"))).toEqual([
      "low",
      "mid",
      "high",
    ]);
  });

  it("sorts names in Korean order", () => {
    const rows = [
      row("b", { name: "삼성전자" }),
      row("a", { name: "KODEX 200" }),
      row("c", { name: "가온" }),
    ];

    expect(keys(sortPortfolioStockRows(rows, "nameAsc", "relative"))).toEqual(["c", "b", "a"]);
    expect(keys(sortPortfolioStockRows(rows, "nameDesc", "relative"))).toEqual(["a", "b", "c"]);
  });

  it("does not change the input array", () => {
    const rows = [row("low", { value: 1 }), row("high", { value: 2 })];
    sortPortfolioStockRows(rows, "evalDesc", "relative");

    expect(keys(rows)).toEqual(["low", "high"]);
  });
});
