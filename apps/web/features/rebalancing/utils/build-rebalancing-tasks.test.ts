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

function summary(rows: RebalancingGapRow[], cash?: number): RebalancingSummary {
  return {
    rows,
    cashRow: cash === undefined ? undefined : row({ allocationId: "cash", actualValue: cash }),
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
        priceAsOf: null,
        priceKind: null,
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

  it("records when and what kind of price the task was calculated with", () => {
    const [task] = buildRebalancingTasks(
      summary([row({ action: "매수", gapValue: 1_000_000 })]),
      new Map([["KOSPI:005930", price(70_000)]])
    );

    expect(task).toMatchObject({ priceAsOf: "2026-11-06T06:30:00.000Z", priceKind: "close" });
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

  describe("when rounded buys cost more than the cash available", () => {
    const prices = (entries: Record<string, number>) =>
      new Map(Object.entries(entries).map(([ticker, close]) => [`KOSPI:${ticker}`, price(close)]));
    const buy = (ticker: string, gapValue: number) =>
      row({ allocationId: ticker, ticker, action: "매수", gapValue });
    const sell = (ticker: string, gapValue: number) =>
      row({ allocationId: ticker, ticker, action: "매도", gapValue });
    const cost = (tasks: ReturnType<typeof buildRebalancingTasks>, action: "매수" | "매도") =>
      tasks
        .filter((t) => t.action === action)
        .reduce((sum, t) => sum + (t.quantity ?? 0) * (t.price ?? 0), 0);

    it("keeps the rounded quantities when the buys fit in the cash", () => {
      // 1.6주 → 2주 = 200,000원 ≤ 200,000원
      const tasks = buildRebalancingTasks(
        summary([buy("A", 160_000)], 200_000),
        prices({ A: 100_000 })
      );

      expect(tasks[0]?.quantity).toBe(2);
    });

    it("takes off one share when rounding up overspends the cash", () => {
      // 1.6주 → 2주 = 200,000원 > 160,000원 → 1주
      const tasks = buildRebalancingTasks(
        summary([buy("A", 160_000)], 160_000),
        prices({ A: 100_000 })
      );

      expect(tasks[0]?.quantity).toBe(1);
    });

    it("counts sell proceeds at the snapshot price as cash for the buys", () => {
      // 매도 3주(300,000원) + 예수금 50,000원 = 350,000원. 매수 3.5주 → 4주 = 400,000원 → 3주
      const tasks = buildRebalancingTasks(
        summary([sell("S", -300_000), buy("B", 350_000)], 50_000),
        prices({ S: 100_000, B: 100_000 })
      );

      expect(tasks.find((t) => t.id === "B")?.quantity).toBe(3);
      expect(cost(tasks, "매수")).toBeLessThanOrEqual(50_000 + cost(tasks, "매도"));
    });

    it("cuts more buys when a sell rounds down", () => {
      // 매도 2.4주 → 2주 = 200,000원 (권장 240,000원). 예수금 0원.
      // 매수 A 1주 (120,000원), B 1주 (120,000원) = 240,000원 → 하나를 0주로 (같으면 앞 줄)
      const tasks = buildRebalancingTasks(
        summary([sell("S", -240_000), buy("A", 120_000), buy("B", 120_000)], 0),
        prices({ S: 100_000, A: 120_000, B: 120_000 })
      );

      expect(cost(tasks, "매수")).toBeLessThanOrEqual(cost(tasks, "매도"));
      expect(tasks.filter((t) => t.action === "매수").map((t) => [t.id, t.quantity])).toEqual([
        ["A", 0],
        ["B", 1],
      ]);
    });

    it("takes the share off the buy that ends up least short of its target", () => {
      // A: 권장 160,000원, 100,000원 × 2주 → 1주면 60,000원 모자람
      // B: 권장 140,000원, 50,000원 × 3주 → 2주면 40,000원 모자람 ← 덜 모자라므로 B 를 줄인다
      // 합 350,000원 > 예수금 300,000원 → B 2주 = 300,000원
      const tasks = buildRebalancingTasks(
        summary([buy("A", 160_000), buy("B", 140_000)], 300_000),
        prices({ A: 100_000, B: 50_000 })
      );

      expect(Object.fromEntries(tasks.map((t) => [t.id, t.quantity]))).toEqual({ A: 2, B: 2 });
    });

    it("breaks ties by the task order (larger amount first)", () => {
      // 둘 다 1주 줄이면 똑같이 40,000원 모자란다 → 목록에서 먼저인 (금액이 큰) A 를 줄인다
      const tasks = buildRebalancingTasks(
        summary([buy("B", 60_000), buy("A", 160_000)], 230_000),
        prices({ A: 100_000, B: 50_000 })
      );

      expect(tasks.map((t) => [t.id, t.quantity])).toEqual([
        ["A", 1],
        ["B", 1],
      ]);
    });

    it("can bring a buy down to 0 shares and keeps it in the list", () => {
      // 0.6주 → 1주 = 100,000원 > 예수금 60,000원 → 0주
      const tasks = buildRebalancingTasks(
        summary([buy("A", 60_000)], 60_000),
        prices({ A: 100_000 })
      );

      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({ quantity: 0, amount: 60_000 });
    });

    it("leaves buys without a price alone and does not count them", () => {
      const tasks = buildRebalancingTasks(
        summary([buy("A", 160_000), buy("X", 500_000)], 160_000),
        prices({ A: 100_000 })
      );

      expect(Object.fromEntries(tasks.map((t) => [t.id, t.quantity]))).toEqual({ A: 1, X: null });
    });

    it("works with fractional (foreign) prices", () => {
      // 10.6주 → 11주 × 123.45 = 1,357.95 > 1,308.57 → 10주
      const tasks = buildRebalancingTasks(
        summary([buy("A", 1_308.57)], 1_308.57),
        prices({ A: 123.45 })
      );

      expect(tasks[0]?.quantity).toBe(10);
    });

    it("handles large amounts without overspending", () => {
      // 예수금 10억 원을 세 종목에 나눠 산다 — 반올림으로 합이 10억 원을 넘는다.
      const tasks = buildRebalancingTasks(
        summary(
          [buy("A", 333_333_333.4), buy("B", 333_333_333.3), buy("C", 333_333_333.3)],
          1_000_000_000
        ),
        prices({ A: 777, B: 1_550, C: 9_876 })
      );

      expect(cost(tasks, "매수")).toBeLessThanOrEqual(1_000_000_000);
      expect(cost(tasks, "매수")).toBeGreaterThan(1_000_000_000 - 9_876);
    });

    it("does not cap the buys without a cash row (cash unknown)", () => {
      const tasks = buildRebalancingTasks(summary([buy("A", 160_000)]), prices({ A: 100_000 }));

      expect(tasks[0]?.quantity).toBe(2);
    });

    it("leaves sells as rounded when there is nothing to buy", () => {
      const tasks = buildRebalancingTasks(
        summary([sell("S", -260_000)], 0),
        prices({ S: 100_000 })
      );

      expect(tasks[0]?.quantity).toBe(3);
    });
  });
});
