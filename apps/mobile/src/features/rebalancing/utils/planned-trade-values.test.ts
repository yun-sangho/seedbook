import {
  type StockPricePoint,
  stockPriceKey,
} from "@mobile/features/investments/utils/use-stock-prices";
import type {
  RebalancingGapRow,
  RebalancingSummary,
} from "@mobile/features/portfolio/utils/compute-rebalancing-gap";
import { describe, expect, it } from "vitest";
import type { RebalancingTask } from "../types/types";
import { buildRebalancingTasks } from "./build-rebalancing-tasks";
import { plannedTradeValues } from "./planned-trade-values";

function task(overrides: Partial<RebalancingTask>): RebalancingTask {
  return {
    id: "a",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    action: "매수",
    amount: 0,
    price: null,
    quantity: null,
    priceAsOf: null,
    priceKind: null,
    done: false,
    ...overrides,
  };
}

describe("plannedTradeValues", () => {
  it("values each trade at its quantity times the start price", () => {
    const result = plannedTradeValues([
      task({ id: "s", action: "매도", amount: 290_000, quantity: 3, price: 100_000 }),
      task({ id: "b", action: "매수", amount: 510_000, quantity: 5, price: 100_000 }),
    ]);

    expect(result.byTaskId).toEqual(
      new Map([
        ["s", 300_000],
        ["b", 500_000],
      ])
    );
  });

  it("totals buys and sells from the same per-trade values", () => {
    const result = plannedTradeValues([
      task({ id: "s", action: "매도", amount: 290_000, quantity: 3, price: 100_000 }),
      task({ id: "b1", action: "매수", amount: 510_000, quantity: 5, price: 100_000 }),
      task({ id: "b2", action: "매수", amount: 140_000, quantity: 2, price: 70_000 }),
    ]);

    expect(result.totalSell).toBe(300_000);
    expect(result.totalBuy).toBe(640_000);
  });

  it("values a buy taken down to 0 shares at 0원", () => {
    const result = plannedTradeValues([
      task({ id: "b", action: "매수", amount: 40_000, quantity: 0, price: 100_000 }),
    ]);

    expect(result.byTaskId.get("b")).toBe(0);
    expect(result.totalBuy).toBe(0);
  });

  it("rounds fractional won prices per trade so the rows add up to the total", () => {
    const result = plannedTradeValues([
      task({ id: "b1", action: "매수", amount: 0, quantity: 3, price: 1000.4 }),
      task({ id: "b2", action: "매수", amount: 0, quantity: 1, price: 1000.4 }),
    ]);

    expect(result.byTaskId.get("b1")).toBe(3001);
    expect(result.byTaskId.get("b2")).toBe(1000);
    expect(result.totalBuy).toBe(4001);
  });

  it("uses the suggested amount for every trade when any trade has no price", () => {
    const result = plannedTradeValues([
      task({ id: "s", action: "매도", amount: 290_000, quantity: 3, price: 100_000 }),
      task({ id: "b", action: "매수", amount: 510_000, quantity: null, price: null }),
    ]);

    expect(result.byTaskId).toEqual(
      new Map([
        ["s", 290_000],
        ["b", 510_000],
      ])
    );
    expect(result.totalSell).toBe(290_000);
    expect(result.totalBuy).toBe(510_000);
  });

  it("returns zero totals when there are no trades", () => {
    const result = plannedTradeValues([]);

    expect(result.byTaskId.size).toBe(0);
    expect(result.totalBuy).toBe(0);
    expect(result.totalSell).toBe(0);
  });
});

describe("plannedTradeValues with buildRebalancingTasks", () => {
  const price = (close: number): StockPricePoint => ({
    close,
    date: "2026-11-06",
    asOf: "2026-11-06T06:30:00.000Z",
    kind: "close",
  });

  function row(overrides: Partial<RebalancingGapRow>): RebalancingGapRow {
    return {
      allocationId: "a",
      market: "KOSPI",
      ticker: "A",
      name: "A",
      targetPercent: 0,
      actualPercent: 0,
      gapPercent: 0,
      targetValue: 0,
      actualValue: 0,
      gapValue: 0,
      action: "유지",
      ...overrides,
    };
  }

  it("shows the buy total that fits the cash after buys are taken down", () => {
    // 거래 가능 금액 110,000원, 두 매수 모두 반올림으로 3주(60,000원) → 합계 120,000원이라 1주 줄인다.
    const rows = [
      row({ allocationId: "a", ticker: "A", action: "매수", gapValue: 55_000 }),
      row({ allocationId: "b", ticker: "B", action: "매수", gapValue: 55_000 }),
      row({ allocationId: "keep", ticker: "K", action: "유지", gapValue: 5_000 }),
    ];
    const summary: RebalancingSummary = {
      rows,
      cashRow: row({ allocationId: "cash", actualValue: 110_000 }),
      currentBaseValue: 0,
      cashDelta: 0,
      newBaseValue: 0,
      totalBuyValue: 110_000,
      totalSellValue: 0,
      netCashChange: 0,
      unallocatedPercent: 0,
    };
    const prices = new Map([
      [stockPriceKey("KOSPI", "A"), price(20_000)],
      [stockPriceKey("KOSPI", "B"), price(20_000)],
      [stockPriceKey("KOSPI", "K"), price(20_000)],
    ]);

    const result = plannedTradeValues(buildRebalancingTasks(summary, prices));

    expect(result.totalBuy).toBe(100_000);
  });
});
