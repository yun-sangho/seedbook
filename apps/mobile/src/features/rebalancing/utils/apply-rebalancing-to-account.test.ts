import type { InvestmentItem, StockHolding } from "@mobile/features/investments/types/types";
import { describe, expect, it } from "vitest";
import type { RebalancingSession, RebalancingTask } from "../types/types";
import { applyRebalancingToAccount } from "./apply-rebalancing-to-account";

function task(overrides: Partial<RebalancingTask> = {}): RebalancingTask {
  return {
    id: "alloc-a",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    action: "매수",
    amount: 100_000,
    price: 50_000,
    quantity: 2,
    priceAsOf: null,
    priceKind: null,
    done: true,
    ...overrides,
  };
}

function holding(overrides: Partial<StockHolding> = {}): StockHolding {
  return {
    id: "h1",
    market: "KOSPI",
    ticker: "005930",
    name: "삼성전자",
    currency: "KRW",
    quantity: 10,
    memo: "",
    ...overrides,
  };
}

function account(overrides: Partial<InvestmentItem> = {}): InvestmentItem {
  return {
    id: "acc",
    accountName: "연금",
    accountType: "연금저축",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 0,
    records: [],
    holdings: [holding()],
    cashItems: [{ id: "c1", label: "예수금", amount: 1_000_000 }],
    note: "",
    color: "#000",
    ...overrides,
  };
}

function session(tasks: RebalancingTask[], cashDelta = 0): RebalancingSession {
  return {
    id: "s1",
    accountId: "acc",
    accountName: "연금",
    portfolioId: "p",
    portfolioName: "안정형",
    cashDelta,
    tasks,
    startedAt: "2026-11-01T00:00:00.000Z",
    completedAt: null,
  };
}

const KRW = () => "KRW";

describe("applyRebalancingToAccount", () => {
  it("adds bought shares to the existing holding", () => {
    const { account: result } = applyRebalancingToAccount(account(), session([task()]), KRW);

    expect(result.holdings[0]?.quantity).toBe(12);
  });

  it("subtracts sold shares from the holding", () => {
    const { account: result } = applyRebalancingToAccount(
      account(),
      session([task({ action: "매도", quantity: 3 })]),
      KRW
    );

    expect(result.holdings[0]?.quantity).toBe(7);
  });

  it("sells across every holding row of the same stock", () => {
    const acc = account({
      holdings: [holding({ id: "h1", quantity: 3 }), holding({ id: "h2", quantity: 4 })],
    });

    const result = applyRebalancingToAccount(
      acc,
      session([task({ action: "매도", quantity: 5 })]),
      KRW
    );

    expect(result.account.holdings.map((h) => [h.id, h.quantity])).toEqual([
      ["h1", 0],
      ["h2", 2],
    ]);
  });

  it("applies the quantity actually traded, not the recommendation", () => {
    const result = applyRebalancingToAccount(
      account(),
      session([task({ action: "매수", quantity: 5, executedQuantity: 3 })]),
      KRW
    );

    expect(result.account.holdings[0]!.quantity).toBe(13);
    expect(result.cashChange).toBe(-150_000);
  });

  it("moves cash by the price actually traded at when buying", () => {
    const result = applyRebalancingToAccount(
      account(),
      session([task({ action: "매수", quantity: 2, executedQuantity: 2, executedPrice: 49_000 })]),
      KRW
    );

    expect(result.cashChange).toBe(-98_000);
  });

  it("moves cash by the price actually traded at when selling", () => {
    const result = applyRebalancingToAccount(
      account(),
      session([task({ action: "매도", quantity: 2, executedQuantity: 2, executedPrice: 51_000 })]),
      KRW
    );

    expect(result.cashChange).toBe(102_000);
  });

  it("applies a task without a snapshot price once a traded price and quantity are recorded", () => {
    const result = applyRebalancingToAccount(
      account(),
      session([task({ price: null, quantity: null, executedQuantity: 3, executedPrice: 40_000 })]),
      KRW
    );

    expect(result.skipped).toEqual([]);
    expect(result.account.holdings[0]?.quantity).toBe(13);
    expect(result.cashChange).toBe(-120_000);
  });

  it("keeps a fully sold holding at zero instead of going negative", () => {
    const { account: result } = applyRebalancingToAccount(
      account(),
      session([task({ action: "매도", quantity: 15 })]),
      KRW
    );

    expect(result.holdings[0]?.quantity).toBe(0);
  });

  it("adds cash only for the shares actually held when selling more than held", () => {
    // 10주 보유인데 15주 매도로 기록 → 실제로 판 10주 × 5만원만 예수금에 더한다
    const result = applyRebalancingToAccount(
      account(),
      session([task({ action: "매도", quantity: 15 })]),
      KRW
    );

    expect(result.cashChange).toBe(500_000);
  });

  it("adds a new holding for a stock the account did not hold", () => {
    const { account: result } = applyRebalancingToAccount(
      account(),
      session([task({ id: "alloc-b", ticker: "000660", name: "SK하이닉스", quantity: 1 })]),
      KRW
    );

    expect(result.holdings[1]).toMatchObject({
      market: "KOSPI",
      ticker: "000660",
      name: "SK하이닉스",
      currency: "KRW",
      quantity: 1,
    });
  });

  it("moves cash by sells minus buys at the snapshot price, plus the cash deposit", () => {
    const { account: result, cashChange } = applyRebalancingToAccount(
      account(),
      session(
        [
          task({ action: "매도", ticker: "005930", quantity: 4, price: 50_000 }),
          task({ id: "alloc-b", action: "매수", ticker: "000660", quantity: 1, price: 150_000 }),
        ],
        300_000
      ),
      KRW
    );

    // +200,000 (매도) - 150,000 (매수) + 300,000 (투입)
    expect(cashChange).toBe(350_000);
    expect(result.cashItems[0]?.amount).toBe(1_350_000);
  });

  it("leaves cash held back from trading in the account", () => {
    // 예수금 1,000,000원 중 거래 가능 금액을 900,000원으로 잡음 → 남겨 둔 100,000원은 빠지지 않는다
    const { cashChange } = applyRebalancingToAccount(
      account(),
      session([task({ action: "매도", quantity: 1, price: 50_000 })], -100_000),
      KRW
    );

    expect(cashChange).toBe(50_000);
  });

  it("creates a 예수금 cash item when the account has none", () => {
    const { account: result } = applyRebalancingToAccount(
      account({ cashItems: [] }),
      session([task({ action: "매도", quantity: 1 })]),
      KRW
    );

    expect(result.cashItems).toEqual([
      expect.objectContaining({ label: "예수금", amount: 50_000 }),
    ]);
  });

  it("leaves the cash the buys are short of as negative cash", () => {
    // 예수금 10,000원으로 2주 × 50,000원 매수 → 90,000원 모자라 예수금 −90,000원 (미수)
    const { account: result, cash } = applyRebalancingToAccount(
      account({ cashItems: [{ id: "c1", label: "예수금", amount: 10_000 }] }),
      session([task({ quantity: 2, price: 50_000 })]),
      KRW
    );

    expect(result.cashItems[0]?.amount).toBe(-90_000);
    expect(cash).toEqual({ before: 10_000, after: -90_000 });
  });

  it("reports how much cash the buys are short of", () => {
    // 예수금 10,000원으로 2주 × 50,000원 매수 → 90,000원 모자람
    const { cashShortfall } = applyRebalancingToAccount(
      account({ cashItems: [{ id: "c1", label: "예수금", amount: 10_000 }] }),
      session([task({ quantity: 2, price: 50_000 })]),
      KRW
    );

    expect(cashShortfall).toBe(90_000);
  });

  it("creates a negative 예수금 item when an account without cash buys", () => {
    const { account: result } = applyRebalancingToAccount(
      account({ cashItems: [] }),
      session([task({ quantity: 1, price: 50_000 })]),
      KRW
    );

    expect(result.cashItems).toEqual([
      expect.objectContaining({ label: "예수금", amount: -50_000 }),
    ]);
  });

  it("pays back negative cash with sell proceeds", () => {
    const { account: result, cashShortfall } = applyRebalancingToAccount(
      account({ cashItems: [{ id: "c1", label: "예수금", amount: -30_000 }] }),
      session([task({ action: "매도", quantity: 1, price: 50_000 })]),
      KRW
    );

    expect(result.cashItems[0]?.amount).toBe(20_000);
    expect(cashShortfall).toBe(0);
  });

  it("adds a new shortfall to cash that is already negative", () => {
    const { account: result, cashShortfall } = applyRebalancingToAccount(
      account({ cashItems: [{ id: "c1", label: "예수금", amount: -30_000 }] }),
      session([task({ quantity: 1, price: 50_000 })]),
      KRW
    );

    expect(result.cashItems[0]?.amount).toBe(-80_000);
    expect(cashShortfall).toBe(80_000);
  });

  it("reports no shortfall when the cash covers the buys", () => {
    const { cashShortfall } = applyRebalancingToAccount(
      account(),
      session([task({ quantity: 2, price: 50_000 })]),
      KRW
    );

    expect(cashShortfall).toBe(0);
  });

  it("skips tasks without a snapshot price and reports them", () => {
    const noPrice = task({ price: null, quantity: null });

    const { account: result, skipped } = applyRebalancingToAccount(
      account(),
      session([noPrice]),
      KRW
    );

    expect(skipped).toEqual([noPrice]);
    expect(result.holdings[0]?.quantity).toBe(10);
    expect(result.cashItems[0]?.amount).toBe(1_000_000);
  });

  it("skips a sell for a stock the account does not hold", () => {
    const sell = task({ action: "매도", ticker: "000660" });

    const { skipped, cashChange } = applyRebalancingToAccount(account(), session([sell]), KRW);

    expect(skipped).toEqual([sell]);
    expect(cashChange).toBe(0);
  });

  it("ignores tasks that are not checked", () => {
    const { account: result } = applyRebalancingToAccount(
      account(),
      session([task({ done: false })]),
      KRW
    );

    expect(result.holdings[0]?.quantity).toBe(10);
  });
});

describe("applyRebalancingToAccount changes", () => {
  it("lists each applied trade with the holding quantity before and after", () => {
    const sell = task({ action: "매도", quantity: 3 });
    const buy = task({ id: "alloc-b", ticker: "000660", name: "SK하이닉스", quantity: 1 });

    const { holdingChanges } = applyRebalancingToAccount(account(), session([sell, buy]), KRW);

    expect(holdingChanges).toEqual([
      { task: sell, before: 10, after: 7 },
      { task: buy, before: 0, after: 1 },
    ]);
  });

  it("reports the cash balance before and after", () => {
    const { cash } = applyRebalancingToAccount(
      account(),
      session([task({ action: "매도", quantity: 1, price: 50_000 })]),
      KRW
    );

    expect(cash).toEqual({ before: 1_000_000, after: 1_050_000 });
  });

  it("reports cash from zero when the account has no cash item", () => {
    const { cash } = applyRebalancingToAccount(
      account({ cashItems: [] }),
      session([task({ action: "매도", quantity: 1, price: 50_000 })]),
      KRW
    );

    expect(cash).toEqual({ before: 0, after: 50_000 });
  });
});

describe("applyRebalancingToAccount with several cash items", () => {
  const cashItems = [
    { id: "cma", label: "CMA", amount: 900 },
    { id: "deposit", label: "예수금", amount: 100 },
    { id: "mmf", label: "MMF", amount: 500 },
  ];
  const buy = (price: number) => task({ quantity: 1, price });
  const amounts = (acc: InvestmentItem) => acc.cashItems.map((c) => [c.id, c.amount]);

  it("spends only the 예수금 item while it covers the buys", () => {
    const result = applyRebalancingToAccount(account({ cashItems }), session([buy(60)]), KRW);

    expect(amounts(result.account)).toEqual([
      ["cma", 900],
      ["deposit", 40],
      ["mmf", 500],
    ]);
  });

  it("spends the other items in order once the 예수금 item runs out", () => {
    const result = applyRebalancingToAccount(account({ cashItems }), session([buy(1_200)]), KRW);

    expect(amounts(result.account)).toEqual([
      ["cma", 0],
      ["deposit", 0],
      ["mmf", 300],
    ]);
    expect(result.cashShortfall).toBe(0);
  });

  it("spends from the first item when there is no 예수금 item", () => {
    const result = applyRebalancingToAccount(
      account({ cashItems: cashItems.filter((c) => c.id !== "deposit") }),
      session([buy(1_000)]),
      KRW
    );

    expect(amounts(result.account)).toEqual([
      ["cma", 0],
      ["mmf", 400],
    ]);
  });

  it("adds sell proceeds to the 예수금 item only", () => {
    const result = applyRebalancingToAccount(
      account({ cashItems }),
      session([task({ action: "매도", quantity: 1, price: 300 })]),
      KRW
    );

    expect(amounts(result.account)).toEqual([
      ["cma", 900],
      ["deposit", 400],
      ["mmf", 500],
    ]);
  });

  it("uses newly deposited cash before the existing items", () => {
    const result = applyRebalancingToAccount(account({ cashItems }), session([buy(550)], 500), KRW);

    expect(amounts(result.account)).toEqual([
      ["cma", 900],
      ["deposit", 50],
      ["mmf", 500],
    ]);
  });

  it("leaves cash held back from trading across the items", () => {
    // 현금 1,500원 중 거래 가능 금액 1,000원을 다 쓰면 남겨 둔 500원은 계좌에 남는다
    const result = applyRebalancingToAccount(
      account({ cashItems }),
      session([buy(1_000)], -500),
      KRW
    );

    expect(amounts(result.account)).toEqual([
      ["cma", 0],
      ["deposit", 0],
      ["mmf", 500],
    ]);
  });

  it("spends every item to zero and leaves the shortfall on the 예수금 item", () => {
    const result = applyRebalancingToAccount(account({ cashItems }), session([buy(1_700)]), KRW);

    expect(result.cashShortfall).toBe(200);
    expect(amounts(result.account)).toEqual([
      ["cma", 0],
      ["deposit", -200],
      ["mmf", 0],
    ]);
  });

  it("leaves the shortfall on the first item when there is no 예수금 item", () => {
    const result = applyRebalancingToAccount(
      account({ cashItems: cashItems.filter((c) => c.id !== "deposit") }),
      session([buy(1_600)]),
      KRW
    );

    expect(amounts(result.account)).toEqual([
      ["cma", -200],
      ["mmf", 0],
    ]);
  });

  it("does not spend an item that is already negative as if it were cash", () => {
    const withDebt = [
      { id: "deposit", label: "예수금", amount: -100 },
      { id: "mmf", label: "MMF", amount: 500 },
    ];
    const result = applyRebalancingToAccount(
      account({ cashItems: withDebt }),
      session([buy(600)]),
      KRW
    );

    expect(amounts(result.account)).toEqual([
      ["deposit", -200],
      ["mmf", 0],
    ]);
    expect(result.cash).toEqual({ before: 400, after: -200 });
  });

  it("reports the total cash going negative", () => {
    const { cash } = applyRebalancingToAccount(account({ cashItems }), session([buy(1_700)]), KRW);

    expect(cash).toEqual({ before: 1_500, after: -200 });
  });

  it("reports the total cash before and after", () => {
    const { cash } = applyRebalancingToAccount(account({ cashItems }), session([buy(1_200)]), KRW);

    expect(cash).toEqual({ before: 1_500, after: 300 });
  });
});

describe("applyRebalancingToAccount with a partially filled order", () => {
  // 10주 × 50,000원 매수 주문 중 4주가 49,000원, 1주가 50,000원에 체결됐다.
  const partial = task({
    done: false,
    orderedQuantity: 10,
    orderedPrice: 50_000,
    filledQuantity: 5,
    filledAmount: 4 * 49_000 + 50_000,
  });

  it("applies the filled shares and leaves the remainder out", () => {
    const applied = applyRebalancingToAccount(account(), session([partial]), KRW);

    expect(applied.account.holdings[0]?.quantity).toBe(15);
    expect(applied.skipped).toEqual([]);
  });

  it("spends the cash of the fills at their prices", () => {
    const applied = applyRebalancingToAccount(account(), session([partial]), KRW);

    expect(applied.cashChange).toBe(-246_000);
  });

  it("does not apply an order with nothing filled yet", () => {
    const ordered = task({ done: false, orderedQuantity: 10, orderedPrice: 50_000 });

    const applied = applyRebalancingToAccount(account(), session([ordered]), KRW);

    expect(applied.account.holdings[0]?.quantity).toBe(10);
    expect(applied.cashChange).toBe(0);
  });
});

describe("applyRebalancingToAccount with fills recorded without an order", () => {
  // 목표 매도 4주 중 3주를 51,000원에 팔았다고 바로 기록했다 (주문 기록 없음).
  const partialSell = task({
    action: "매도",
    quantity: 4,
    done: false,
    filledQuantity: 3,
    filledAmount: 3 * 51_000,
  });

  it("applies the shares sold so far", () => {
    const applied = applyRebalancingToAccount(account(), session([partialSell]), KRW);

    expect(applied.account.holdings[0]?.quantity).toBe(7);
  });

  it("adds the sale proceeds of the fills to cash", () => {
    const applied = applyRebalancingToAccount(account(), session([partialSell]), KRW);

    expect(applied.cashChange).toBe(153_000);
  });

  it("applies nothing for a task closed without trading", () => {
    const closed = task({ action: "매도", quantity: 4, done: true, executedQuantity: 0 });

    const applied = applyRebalancingToAccount(account(), session([closed]), KRW);

    expect(applied.account.holdings[0]?.quantity).toBe(10);
    expect(applied.cashChange).toBe(0);
  });
});
