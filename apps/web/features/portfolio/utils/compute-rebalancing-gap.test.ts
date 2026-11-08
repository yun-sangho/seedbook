import { describe, expect, it } from "vitest";
import type { PortfolioAllocation } from "../types/types";
import type { ActualHoldingValue } from "./compute-actual-allocation";
import { computeRebalancingGap, portfolioStockValue } from "./compute-rebalancing-gap";

function makeAllocation(overrides: Partial<PortfolioAllocation> = {}): PortfolioAllocation {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    market: overrides.market ?? "KOSPI",
    ticker: overrides.ticker ?? "005930",
    name: overrides.name ?? "삼성전자",
    currency: overrides.currency ?? "KRW",
    targetPercent: overrides.targetPercent ?? 0,
  };
}

function actualMap(
  entries: Array<[string, number]>,
  base: number
): Map<string, ActualHoldingValue> {
  return new Map(
    entries.map(([key, value]) => [key, { value, percent: base > 0 ? (value / base) * 100 : 0 }])
  );
}

describe("computeRebalancingGap", () => {
  describe("cashDelta = 0 (pure rebalancing)", () => {
    it("returns empty rows when allocations are empty", () => {
      const result = computeRebalancingGap([], new Map(), 1000000, 0);
      expect(result.rows).toEqual([]);
      expect(result.newBaseValue).toBe(1000000);
      expect(result.totalBuyValue).toBe(0);
      expect(result.totalSellValue).toBe(0);
    });

    it("buy and sell amounts net to zero when only rebalancing", () => {
      // Target: 50/50.
      // Actual: 70/30 of a 1,000,000 portfolio → 700k vs 300k.
      // After rebalance: 500k/500k → buy 200k of B, sell 200k of A.
      const base = 1000000;
      const allocations = [
        makeAllocation({ ticker: "005930", targetPercent: 50 }),
        makeAllocation({ ticker: "000660", targetPercent: 50 }),
      ];
      const actual = actualMap(
        [
          ["KOSPI:005930", 700000],
          ["KOSPI:000660", 300000],
        ],
        base
      );
      const result = computeRebalancingGap(allocations, actual, base, 0);
      expect(result.totalBuyValue).toBeCloseTo(200000);
      expect(result.totalSellValue).toBeCloseTo(200000);
      expect(result.netCashChange).toBeCloseTo(0);
      expect(result.newBaseValue).toBe(1000000);

      const sellRow = result.rows.find((r) => r.ticker === "005930")!;
      const buyRow = result.rows.find((r) => r.ticker === "000660")!;
      expect(sellRow.action).toBe("매도");
      expect(sellRow.gapValue).toBeCloseTo(-200000);
      expect(buyRow.action).toBe("매수");
      expect(buyRow.gapValue).toBeCloseTo(200000);
    });

    it("returns 유지 when gap is within threshold", () => {
      const base = 1000000;
      const allocations = [
        makeAllocation({ ticker: "005930", targetPercent: 50 }),
        makeAllocation({ ticker: "000660", targetPercent: 50 }),
      ];
      // 50.5/49.5 — within default 1% threshold
      const actual = actualMap(
        [
          ["KOSPI:005930", 505000],
          ["KOSPI:000660", 495000],
        ],
        base
      );
      const result = computeRebalancingGap(allocations, actual, base, 0);
      for (const row of result.rows) {
        expect(row.action).toBe("유지");
      }
    });

    it("respects custom threshold option", () => {
      const base = 1000000;
      const allocations = [
        makeAllocation({ ticker: "005930", targetPercent: 50 }),
        makeAllocation({ ticker: "000660", targetPercent: 50 }),
      ];
      // 53/47 — outside default 1%, but within custom 5%
      const actual = actualMap(
        [
          ["KOSPI:005930", 530000],
          ["KOSPI:000660", 470000],
        ],
        base
      );
      const result = computeRebalancingGap(allocations, actual, base, 0, {
        actionThresholdPercent: 5,
      });
      for (const row of result.rows) {
        expect(row.action).toBe("유지");
      }
    });
  });

  describe("cashDelta > 0 (cash injection)", () => {
    it("buys all under-target stocks when adding cash to a balanced portfolio", () => {
      const base = 1000000;
      const allocations = [
        makeAllocation({ ticker: "005930", targetPercent: 50 }),
        makeAllocation({ ticker: "000660", targetPercent: 50 }),
      ];
      // Already at target ratio
      const actual = actualMap(
        [
          ["KOSPI:005930", 500000],
          ["KOSPI:000660", 500000],
        ],
        base
      );
      const cashDelta = 500000;
      const result = computeRebalancingGap(allocations, actual, base, cashDelta);
      expect(result.newBaseValue).toBe(1500000);
      // Each should grow to 750k → buy 250k of each
      const r1 = result.rows.find((r) => r.ticker === "005930")!;
      const r2 = result.rows.find((r) => r.ticker === "000660")!;
      expect(r1.targetValue).toBe(750000);
      expect(r2.targetValue).toBe(750000);
      expect(r1.gapValue).toBeCloseTo(250000);
      expect(r2.gapValue).toBeCloseTo(250000);
      expect(r1.action).toBe("매수");
      expect(r2.action).toBe("매수");
      expect(result.totalBuyValue).toBeCloseTo(500000);
      expect(result.totalSellValue).toBeCloseTo(0);
      expect(result.netCashChange).toBeCloseTo(500000);
    });

    it("starting from zero holdings + cash injection allocates full cash to all targets", () => {
      const allocations = [
        makeAllocation({ ticker: "005930", targetPercent: 60 }),
        makeAllocation({ ticker: "000660", targetPercent: 40 }),
      ];
      const result = computeRebalancingGap(allocations, new Map(), 0, 1000000);
      expect(result.newBaseValue).toBe(1000000);
      expect(result.rows.find((r) => r.ticker === "005930")!.gapValue).toBeCloseTo(600000);
      expect(result.rows.find((r) => r.ticker === "000660")!.gapValue).toBeCloseTo(400000);
      // Sum of buys ≈ injected cash
      expect(result.totalBuyValue).toBeCloseTo(1000000);
      expect(result.totalSellValue).toBe(0);
    });
  });

  describe("cashDelta < 0 (cash withdrawal)", () => {
    it("sells proportionally when withdrawing cash from a balanced portfolio", () => {
      const base = 1000000;
      const allocations = [
        makeAllocation({ ticker: "005930", targetPercent: 50 }),
        makeAllocation({ ticker: "000660", targetPercent: 50 }),
      ];
      const actual = actualMap(
        [
          ["KOSPI:005930", 500000],
          ["KOSPI:000660", 500000],
        ],
        base
      );
      const result = computeRebalancingGap(allocations, actual, base, -400000);
      expect(result.newBaseValue).toBe(600000);
      // Each target → 300k. Need to sell 200k from each.
      for (const row of result.rows) {
        expect(row.targetValue).toBe(300000);
        expect(row.gapValue).toBeCloseTo(-200000);
        expect(row.action).toBe("매도");
      }
      expect(result.totalBuyValue).toBe(0);
      expect(result.totalSellValue).toBeCloseTo(400000);
      expect(result.netCashChange).toBeCloseTo(-400000);
    });

    it("clamps newBaseValue to 0 when withdrawal exceeds current holdings", () => {
      const base = 500000;
      const allocations = [makeAllocation({ ticker: "005930", targetPercent: 100 })];
      const actual = actualMap([["KOSPI:005930", 500000]], base);
      const result = computeRebalancingGap(allocations, actual, base, -1000000);
      expect(result.newBaseValue).toBe(0);
      const row = result.rows[0]!;
      expect(row.targetValue).toBe(0);
      expect(row.gapValue).toBe(-500000);
      expect(row.action).toBe("매도");
    });
  });

  describe("edge cases", () => {
    it("does not throw and returns 0 percentages when currentBaseValue is 0 and cashDelta is 0", () => {
      const allocations = [makeAllocation({ ticker: "005930", targetPercent: 100 })];
      const result = computeRebalancingGap(allocations, new Map(), 0, 0);
      expect(result.newBaseValue).toBe(0);
      expect(result.rows[0]!.actualPercent).toBe(0);
      expect(result.rows[0]!.targetValue).toBe(0);
      expect(result.rows[0]!.gapValue).toBe(0);
      expect(result.rows[0]!.action).toBe("유지");
    });

    it("computes unallocatedPercent as 100 - sum(targetPercent)", () => {
      const allocations = [
        makeAllocation({ ticker: "005930", targetPercent: 60 }),
        makeAllocation({ ticker: "000660", targetPercent: 30 }),
      ];
      const result = computeRebalancingGap(allocations, new Map(), 0, 0);
      expect(result.unallocatedPercent).toBeCloseTo(10);
    });

    it("clamps unallocatedPercent to 0 when targets sum exceeds 100", () => {
      const allocations = [
        makeAllocation({ ticker: "005930", targetPercent: 60 }),
        makeAllocation({ ticker: "000660", targetPercent: 60 }),
      ];
      const result = computeRebalancingGap(allocations, new Map(), 0, 0);
      expect(result.unallocatedPercent).toBe(0);
    });

    it("ignores actual holdings of stocks not present in allocations", () => {
      // 보유만 있고 목표 없는 종목 — rows 는 allocations 만 iterate
      const allocations = [makeAllocation({ ticker: "005930", targetPercent: 100 })];
      const actual = actualMap(
        [
          ["KOSPI:005930", 700000],
          ["KOSPI:UNTRACKED", 300000], // not in allocations — ignored
        ],
        1000000
      );
      const result = computeRebalancingGap(allocations, actual, 1000000, 0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.ticker).toBe("005930");
      // Target = 1,000,000, Actual = 700,000 → buy 300,000
      expect(result.rows[0]!.gapValue).toBeCloseTo(300000);
    });

    it("preserves allocation order in rows", () => {
      const allocations = [
        makeAllocation({ ticker: "C", targetPercent: 30 }),
        makeAllocation({ ticker: "A", targetPercent: 50 }),
        makeAllocation({ ticker: "B", targetPercent: 20 }),
      ];
      const result = computeRebalancingGap(allocations, new Map(), 0, 100);
      expect(result.rows.map((r) => r.ticker)).toEqual(["C", "A", "B"]);
    });
  });

  describe("cashBalance (계좌 예수금, 목표 0원)", () => {
    it("adds the cash to the base so every won is allocated by target weights", () => {
      // 주식 A 500k + 예수금 500k, 목표 A 100% → A 를 1,000k 까지 매수.
      const a = makeAllocation({ ticker: "A", targetPercent: 100 });
      const perStock = actualMap([["KOSPI:A", 500_000]], 500_000);

      const result = computeRebalancingGap([a], perStock, 500_000, 0, { cashBalance: 500_000 });

      expect(result.newBaseValue).toBe(1_000_000);
      expect(result.rows[0]).toMatchObject({
        targetValue: 1_000_000,
        gapValue: 500_000,
        action: "매수",
      });
      expect(result.rows[0]?.actualPercent).toBeCloseTo(50);
    });

    it("reports cash as its own row targeting 0원", () => {
      const a = makeAllocation({ ticker: "A", targetPercent: 100 });
      const perStock = actualMap([["KOSPI:A", 750_000]], 750_000);

      const result = computeRebalancingGap([a], perStock, 750_000, 0, { cashBalance: 250_000 });

      expect(result.cashRow).toMatchObject({
        name: "예수금",
        targetPercent: 0,
        targetValue: 0,
        actualValue: 250_000,
        gapValue: -250_000,
      });
      expect(result.cashRow?.actualPercent).toBeCloseTo(25);
      expect(result.cashRow?.gapPercent).toBeCloseTo(-25);
    });

    it("keeps cash out of the buy/sell totals (buys are funded by the cash)", () => {
      const a = makeAllocation({ ticker: "A", targetPercent: 100 });
      const perStock = actualMap([["KOSPI:A", 500_000]], 500_000);

      const result = computeRebalancingGap([a], perStock, 500_000, 0, { cashBalance: 500_000 });

      expect(result.totalBuyValue).toBe(500_000);
      expect(result.totalSellValue).toBe(0);
    });

    it("stacks a simulated deposit on top of the existing cash", () => {
      const a = makeAllocation({ ticker: "A", targetPercent: 100 });
      const perStock = actualMap([["KOSPI:A", 500_000]], 500_000);

      const result = computeRebalancingGap([a], perStock, 500_000, 100_000, {
        cashBalance: 400_000,
      });

      expect(result.newBaseValue).toBe(1_000_000);
      expect(result.cashRow?.actualValue).toBe(500_000);
      expect(result.rows[0]?.gapValue).toBe(500_000);
    });

    it("allocates cash even when the account holds no stock yet", () => {
      const a = makeAllocation({ ticker: "A", targetPercent: 100 });

      const result = computeRebalancingGap([a], new Map(), 0, 0, { cashBalance: 1_000_000 });

      expect(result.rows[0]).toMatchObject({ gapValue: 1_000_000, action: "매수" });
      expect(result.cashRow?.gapPercent).toBeCloseTo(-100);
    });

    it("has no cash row when no cash balance option is given (desktop behaviour unchanged)", () => {
      const a = makeAllocation({ ticker: "A", targetPercent: 100 });
      const perStock = actualMap([["KOSPI:A", 500_000]], 500_000);

      const result = computeRebalancingGap([a], perStock, 500_000, 0);

      expect(result.cashRow).toBeUndefined();
      expect(result.newBaseValue).toBe(500_000);
    });
  });
});

describe("portfolioStockValue", () => {
  it("포트폴리오 종목의 평가액만 더한다 — 포트폴리오에 없는 보유 종목은 빠진다", () => {
    const perStock = new Map([
      ["KOSPI:AAA", { value: 600_000, percent: 0 }],
      ["KOSPI:OTHER", { value: 1_267_000, percent: 0 }],
    ]);

    const value = portfolioStockValue(
      [
        { id: "a", market: "KOSPI", ticker: "AAA", name: "A", currency: "KRW", targetPercent: 50 },
        { id: "b", market: "KOSPI", ticker: "BBB", name: "B", currency: "KRW", targetPercent: 50 },
      ],
      perStock
    );

    expect(value).toBe(600_000);
  });

  it("같은 종목이 목표에 두 번 들어 있어도 한 번만 더한다", () => {
    const perStock = new Map([["KOSPI:AAA", { value: 600_000, percent: 0 }]]);

    const value = portfolioStockValue(
      [
        { id: "a", market: "KOSPI", ticker: "AAA", name: "A", currency: "KRW", targetPercent: 50 },
        { id: "a2", market: "KOSPI", ticker: "AAA", name: "A", currency: "KRW", targetPercent: 50 },
      ],
      perStock
    );

    expect(value).toBe(600_000);
  });
});
