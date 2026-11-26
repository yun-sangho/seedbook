import type { InvestmentItem } from "@web/features/investments/types/types";
import { describe, expect, it } from "vitest";
import type { RebalancingSession, RebalancingTask } from "../types/types";
import { affordableQuantity } from "./affordable-quantity";
import { fillRebalancingTaskOrder, orderRebalancingTaskWith } from "./rebalancing-session";
import {
  buyShortfall,
  rebalancingCashOutlook,
  tradeCashPreview,
  tradeCashPreviewFor,
} from "./trade-cash-check";

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

  it("does not let trades use cash held back from trading", () => {
    // 예수금 100,000원 중 거래 가능 금액 70,000원 → 10주 × 10,000원은 30,000원 모자람
    expect(
      cashShortfallAfterTrade(account(100_000), session([task()], -30_000), "buy", 10, 10_000)
    ).toBe(30_000);
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

describe("tradeCashPreview with buy orders waiting to fill", () => {
  const orderedBuy = (overrides: Partial<RebalancingTask> = {}) =>
    task({
      id: "ordered",
      ticker: "005930",
      orderedQuantity: 3,
      orderedPrice: 10_000,
      ...overrides,
    });

  it("holds back other buy orders from cash before", () => {
    const preview = tradeCashPreview(
      account(100_000),
      session([orderedBuy(), task()]),
      "buy",
      2,
      10_000
    );
    expect(preview).toEqual({ before: 70_000, after: 50_000 });
  });

  it("releases an order's own hold when filling it, so it is not counted twice", () => {
    const ordered = orderedBuy({ id: "buy", ticker: "069500" });
    const preview = tradeCashPreview(account(100_000), session([ordered]), "buy", 3, 10_000);
    expect(preview).toEqual({ before: 100_000, after: 70_000 });
  });

  it("ignores a filled task's old order values", () => {
    const filled = orderedBuy({ done: true, executedQuantity: 3, executedPrice: 10_000 });
    const preview = tradeCashPreview(account(100_000), session([filled, task()]), "buy", 1, 10_000);
    expect(preview.before).toBe(70_000);
  });
});

describe("rebalancingCashOutlook", () => {
  const sell = (overrides: Partial<RebalancingTask> = {}) =>
    task({ id: "sell", ticker: "005930", name: "삼성전자", action: "매도", ...overrides });
  const holding = {
    id: "h1",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    currency: "KRW",
    quantity: 100,
    memo: "",
  };
  const withHolding = (cash: number): InvestmentItem => ({
    ...account(cash),
    holdings: [holding],
  });

  it("is the account cash plus the cash deposit before any trade is done", () => {
    const outlook = rebalancingCashOutlook(account(50_000), session([task()], 50_000));
    expect(outlook.now).toBe(100_000);
  });

  it("includes completed trades at their executed quantity and price", () => {
    const done = sell({ done: true, executedQuantity: 3, executedPrice: 20_000 });
    const outlook = rebalancingCashOutlook(withHolding(0), session([done, task()]));
    expect(outlook.now).toBe(60_000);
  });

  it("expects the remaining trades to follow the recommended quantity and start price", () => {
    // 지금 0 + 매도 10주 × 10,000 − 매수 10주 × 10,000
    const outlook = rebalancingCashOutlook(withHolding(0), session([sell(), task()]));
    expect(outlook.expected).toBe(0);
  });

  it("can expect negative cash when the remaining buys cost more than is left", () => {
    const done = sell({ done: true, executedQuantity: 5, executedPrice: 10_000 });
    const outlook = rebalancingCashOutlook(withHolding(0), session([done, task()]));
    expect(outlook.now).toBe(50_000);
    expect(outlook.expected).toBe(-50_000);
  });

  it("holds back buy orders waiting to fill from cash now", () => {
    const ordered = task({ orderedQuantity: 4, orderedPrice: 10_000 });
    const outlook = rebalancingCashOutlook(account(100_000), session([ordered]));
    expect(outlook.now).toBe(60_000);
    expect(outlook.heldForOrders).toBe(40_000);
  });

  it("expects ordered trades to fill at their order quantity and price", () => {
    const ordered = task({ orderedQuantity: 4, orderedPrice: 10_000 });
    const outlook = rebalancingCashOutlook(account(100_000), session([ordered]));
    expect(outlook.expected).toBe(60_000);
  });

  it("leaves out remaining trades whose price was unknown", () => {
    const unpriced = task({ price: null, quantity: null });
    const outlook = rebalancingCashOutlook(account(30_000), session([unpriced]));
    expect(outlook.expected).toBe(30_000);
  });
});

describe("cash checks with several cash items", () => {
  const multi = (): InvestmentItem => ({
    ...account(0),
    cashItems: [
      { id: "c1", label: "예수금", amount: 100 },
      { id: "c2", label: "CMA", amount: 900 },
    ],
  });

  it("counts every cash item as available now", () => {
    expect(rebalancingCashOutlook(multi(), session([])).now).toBe(1_000);
  });

  it("expects buys to spend the total cash", () => {
    const buy = task({ quantity: 1, price: 1_000 });
    expect(rebalancingCashOutlook(multi(), session([buy])).expected).toBe(0);
  });

  it("allows a buy that needs more than the 예수금 item", () => {
    expect(tradeCashPreview(multi(), session([task()]), "buy", 1, 1_000)).toEqual({
      before: 1_000,
      after: 0,
    });
  });

  it("does not let trades use cash held back from the total", () => {
    expect(cashShortfallAfterTrade(multi(), session([task()], -300), "buy", 1, 1_000)).toBe(300);
  });

  it("adds newly deposited cash to the total", () => {
    expect(rebalancingCashOutlook(multi(), session([], 500)).now).toBe(1_500);
  });

  it("holds back buy orders from the total", () => {
    const ordered = task({ orderedQuantity: 1, orderedPrice: 400 });
    expect(rebalancingCashOutlook(multi(), session([ordered])).now).toBe(600);
  });

  it("affords as many shares as the total cash covers", () => {
    const { before } = tradeCashPreview(multi(), session([task()]), "buy", 20, 100);
    expect(affordableQuantity(before, 100)).toBe(10);
  });
});

describe("buyShortfall", () => {
  it("is 0 when the cash covers the buy", () => {
    expect(buyShortfall("매수", { before: 100_000, after: 0 })).toBe(0);
  });

  it("is how far the buy pushes cash below zero", () => {
    expect(buyShortfall("매수", { before: 100_000, after: -500 })).toBe(500);
  });

  it("is 0 for a sell even when cash stays negative — a sell only pays cash back", () => {
    expect(buyShortfall("매도", { before: -80_000, after: -30_000 })).toBe(0);
  });

  it("counts the account's cash that is already negative", () => {
    // 지난 리밸런싱에서 모자란 채로 매수해 예수금이 −30,000원인 계좌
    const preview = tradeCashPreview(account(-30_000), session([task()]), "buy", 1, 10_000);

    expect(preview).toEqual({ before: -30_000, after: -40_000 });
    expect(buyShortfall("매수", preview)).toBe(40_000);
  });
});

describe("cash with a partially filled buy order", () => {
  // 10주 × 10,000원 매수 주문 중 4주가 9,900원에 체결됐다 — 잔량 6주는 주문 중.
  const partial = () =>
    task({ orderedQuantity: 10, orderedPrice: 10_000, filledQuantity: 4, filledAmount: 39_600 });

  it("spends the filled cash now and holds only the remainder for the order", () => {
    const outlook = rebalancingCashOutlook(account(200_000), session([partial()]));

    expect(outlook.heldForOrders).toBe(60_000);
    expect(outlook.now).toBe(200_000 - 39_600 - 60_000);
  });

  it("expects the remainder to fill at the order price", () => {
    const outlook = rebalancingCashOutlook(account(200_000), session([partial()]));

    expect(outlook.expected).toBe(200_000 - 39_600 - 60_000);
  });

  it("previews a further fill from the cash left after the earlier fills", () => {
    const s = session([partial()]);
    const next = fillRebalancingTaskOrder(s, "buy", 2, 10_000);

    // 앞선 체결분은 이미 썼고, 이 주문의 묶인 금액은 이번 체결에 쓰이므로 before 에서 풀린다.
    // after: 이번 2주 체결 + 남은 4주는 다시 주문 금액만큼 묶인다.
    expect(tradeCashPreviewFor(account(200_000), s, "buy", next)).toEqual({
      before: 160_400,
      after: 160_400 - 20_000 - 40_000,
    });
  });

  it("previews filling the last of the order like any fill", () => {
    const s = session([partial()]);
    const next = fillRebalancingTaskOrder(s, "buy", 6, 10_000);

    expect(tradeCashPreviewFor(account(200_000), s, "buy", next).after).toBe(100_400);
  });

  it("previews amending the order as holding only the new remainder", () => {
    const s = session([partial()]);
    const next = orderRebalancingTaskWith(s, "buy", 8, 10_000);

    expect(tradeCashPreviewFor(account(200_000), s, "buy", next)).toEqual({
      before: 160_400,
      after: 120_400,
    });
  });

  it("previews editing a filled task's total without counting its earlier partial fills twice", () => {
    const s = session([{ ...partial(), done: true, executedQuantity: 10, executedPrice: 9_960 }]);

    expect(tradeCashPreview(account(200_000), s, "buy", 10, 10_000)).toEqual({
      before: 200_000,
      after: 100_000,
    });
  });
});
