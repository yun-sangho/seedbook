import type { StockPricePoint } from "@web/features/investments/utils/use-stock-prices";
import type {
  RebalancingGapRow,
  RebalancingSummary,
} from "@web/features/portfolio/utils/compute-rebalancing-gap";
import { describe, expect, it } from "vitest";
import { buildRebalancingTasks } from "./build-rebalancing-tasks";

function row(overrides: Partial<RebalancingGapRow>): RebalancingGapRow {
  return {
    allocationId: "a",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    targetPercent: 50,
    actualPercent: 50,
    gapPercent: 0,
    targetValue: 0,
    actualValue: 0,
    gapValue: 0,
    action: "유지",
    ...overrides,
  };
}

function summary(rows: RebalancingGapRow[]): RebalancingSummary {
  return {
    rows,
    currentBaseValue: 0,
    cashDelta: 0,
    newBaseValue: 0,
    totalBuyValue: 0,
    totalSellValue: 0,
    netCashChange: 0,
    unallocatedPercent: 0,
  };
}

const price = (close: number): StockPricePoint => ({
  close,
  date: "2026-11-06",
  asOf: "2026-11-06T06:30:00.000Z",
  kind: "close",
});

describe("buildRebalancingTasks", () => {
  it("returns no tasks when every row is 유지", () => {
    const result = buildRebalancingTasks(
      summary([row({ action: "유지", gapValue: 1000 })]),
      new Map()
    );

    expect(result).toEqual([]);
  });

  it("turns a buy row into an unfinished task with a positive rounded amount", () => {
    const result = buildRebalancingTasks(
      summary([row({ allocationId: "a", action: "매수", gapValue: 1_000_000.4 })]),
      new Map()
    );

    expect(result).toEqual([
      {
        id: "a",
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        action: "매수",
        amount: 1_000_000,
        price: null,
        quantity: null,
        done: false,
      },
    ]);
  });

  it("stores the sell amount as a positive number", () => {
    const [task] = buildRebalancingTasks(
      summary([row({ action: "매도", gapValue: -250_000 })]),
      new Map()
    );

    expect(task?.amount).toBe(250_000);
  });

  it("estimates the share count from the snapshot price", () => {
    const [task] = buildRebalancingTasks(
      summary([row({ action: "매수", gapValue: 1_000_000 })]),
      new Map([["KOSPI:005930", price(70_000)]])
    );

    expect(task).toMatchObject({ price: 70_000, quantity: 14 });
  });

  it("lists sells before buys so cash is freed up first, larger amounts first", () => {
    const result = buildRebalancingTasks(
      summary([
        row({ allocationId: "buy-small", action: "매수", gapValue: 100 }),
        row({ allocationId: "sell-small", action: "매도", gapValue: -50 }),
        row({ allocationId: "buy-big", action: "매수", gapValue: 900 }),
        row({ allocationId: "sell-big", action: "매도", gapValue: -500 }),
      ]),
      new Map()
    );

    expect(result.map((t) => t.id)).toEqual(["sell-big", "sell-small", "buy-big", "buy-small"]);
  });
});
