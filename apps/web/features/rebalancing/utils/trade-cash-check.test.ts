import type { InvestmentItem } from "@web/features/investments/types/types";
import { describe, expect, it } from "vitest";
import type { RebalancingSession, RebalancingTask } from "../types/types";
import { tradeCashPreview } from "./trade-cash-check";

/** 예수금이 모자라는 금액 — 0 보다 크면 매매 입력 화면이 완료를 막는다. */
const cashShortfallAfterTrade = (...args: Parameters<typeof tradeCashPreview>) =>
  Math.max(0, -tradeCashPreview(...args).after);

function task(overrides: Partial<RebalancingTask> = {}): RebalancingTask {
  return {
    id: "buy",
    market: "KOSPI",
    ticker: "069500",
    name: "KODEX 200",
    action: "매수",
    amount: 100_000,
    price: 10_000,
    quantity: 10,
    priceAsOf: null,
    priceKind: null,
    done: false,
    ...overrides,
  };
}

function account(cash: number): InvestmentItem {
  return {
    id: "acc",
    accountName: "ISA",
    accountType: "ISA 계좌",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings: [],
    cashItems: [{ id: "c1", label: "예수금", amount: cash }],
    note: "",
    color: "#000",
  };
}

function session(tasks: RebalancingTask[], cashDelta = 0): RebalancingSession {
  return {
    id: "s",
    accountId: "acc",
    accountName: "ISA",
    portfolioId: "p",
    portfolioName: "안정형",
    cashDelta,
    tasks,
    startedAt: "2026-11-10T00:00:00.000Z",
    completedAt: null,
  };
}

describe("cash shortfall (tradeCashPreview after < 0)", () => {
  it("is 0 when the cash covers the trade at the entered price", () => {
    expect(cashShortfallAfterTrade(account(100_000), session([task()]), "buy", 10, 10_000)).toBe(0);
  });

  it("is the amount missing when a higher price would push cash below zero", () => {
    // 10주 × 10,050원 = 100,500원 > 예수금 100,000원
    expect(cashShortfallAfterTrade(account(100_000), session([task()]), "buy", 10, 10_050)).toBe(
      500
    );
  });

  it("counts trades already done, with their recorded prices", () => {
    const done = task({
      id: "done",
      ticker: "005930",
      done: true,
      executedQuantity: 5,
      executedPrice: 10_000,
    });
    // 이미 50,000원 매수 → 남은 50,000원으로 10주 × 10,000원은 50,000원 모자람
    expect(
      cashShortfallAfterTrade(account(100_000), session([done, task()]), "buy", 10, 10_000)
    ).toBe(50_000);
  });

  it("counts cash from sells already done and the cash deposited at the start", () => {
    const sold = task({
      id: "sold",
      ticker: "005930",
      action: "매도",
      done: true,
      executedQuantity: 3,
      executedPrice: 10_000,
    });
    const withHolding = {
      ...account(50_000),
      holdings: [
        {
          id: "h",
          market: "KOSPI",
          ticker: "005930",
          name: "삼성전자",
          currency: "KRW",
          quantity: 3,
          memo: "",
        },
      ],
    };
    // 50,000 + 매도 30,000 + 투입 20,000 = 100,000 → 10주 × 10,000원 가능
    expect(
      cashShortfallAfterTrade(withHolding, session([sold, task()], 20_000), "buy", 10, 10_000)
    ).toBe(0);
  });

  it("ignores trades that are not done yet", () => {
    const pending = task({ id: "pending", ticker: "005930", quantity: 100 });
    expect(
      cashShortfallAfterTrade(account(100_000), session([pending, task()]), "buy", 10, 10_000)
    ).toBe(0);
  });

  it("re-checks a done trade with the new values instead of its old ones", () => {
    const recorded = task({ done: true, executedQuantity: 10, executedPrice: 10_000 });
    expect(cashShortfallAfterTrade(account(100_000), session([recorded]), "buy", 10, 10_100)).toBe(
      1_000
    );
  });
});

describe("tradeCashPreview", () => {
  it("shows cash before this trade and after it", () => {
    expect(tradeCashPreview(account(100_000), session([task()]), "buy", 5, 10_000)).toEqual({
      before: 100_000,
      after: 50_000,
    });
  });

  it("lets cash after go below zero so the shortfall is visible", () => {
    expect(tradeCashPreview(account(100_000), session([task()]), "buy", 10, 10_050).after).toBe(
      -500
    );
  });

  it("counts other done trades in cash before, but not this trade's recorded values", () => {
    const done = task({
      id: "done",
      ticker: "005930",
      done: true,
      executedQuantity: 2,
      executedPrice: 10_000,
    });
    const recorded = task({ done: true, executedQuantity: 3, executedPrice: 10_000 });

    expect(
      tradeCashPreview(account(100_000), session([done, recorded], 5_000), "buy", 1, 10_000)
    ).toEqual({ before: 85_000, after: 75_000 });
  });

  it("adds a sell's proceeds", () => {
    const sell = task({ id: "sell", ticker: "005930", action: "매도" });
    const withHolding = {
      ...account(0),
      holdings: [
        {
          id: "h",
          market: "KOSPI",
          ticker: "005930",
          name: "삼성전자",
          currency: "KRW",
          quantity: 5,
          memo: "",
        },
      ],
    };

    expect(tradeCashPreview(withHolding, session([sell]), "sell", 5, 10_000)).toEqual({
      before: 0,
      after: 50_000,
    });
  });
});
