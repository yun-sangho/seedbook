import type { CashItem, InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import { stockPriceKey } from "@web/features/investments/utils/use-stock-prices";
import { sumCash } from "@web/features/portfolio/utils/linked-portfolio-status";
import type { RebalancingSession, RebalancingTask } from "../types/types";
import { executedPriceOf, executedQuantityOf, isPartiallyFilled } from "./rebalancing-session";

const DEFAULT_CASH_LABEL = "예수금";

export interface AppliedRebalancing {
  account: InvestmentItem;
  /** 예수금 변화 (원). 매도 - 매수 + 현금 투입/인출 */
  cashChange: number;
  /** 반영하지 못한 할 일 — 거래 수량·가격을 모르거나, 보유하지 않은 종목의 매도 */
  skipped: RebalancingTask[];
  /** 반영한 매매별 보유 수량 변화 (할 일 순서). 새로 산 종목은 before 0 */
  holdingChanges: HoldingChange[];
  /** 현금 전체 합(모든 현금 항목)의 변화. 항목이 없었으면 before 0. after 는 마이너스일 수 있다 */
  cash: CashChange;
  /**
   * 반영한 뒤 현금 전체 합이 0 아래로 내려간 금액 (원, 0 이상) — 모자란 채로 기록한 매수의 미수.
   * 이만큼 "예수금" 항목이 마이너스가 된다.
   */
  cashShortfall: number;
}

export interface HoldingChange {
  task: RebalancingTask;
  before: number;
  after: number;
}

export interface CashChange {
  before: number;
  after: number;
}

/**
 * 완료한 리밸런싱의 매매를 계좌에 반영한다.
 *
 * - 완료한 할 일의 실제 수량(`executedQuantityOf`)만큼 보유 수량을 늘리거나 줄인다 (0 아래로 내려가지 않음).
 *   부분 체결된 주문은 체결된 수량만 평균가로 반영하고 잔량은 반영하지 않는다.
 *   같은 종목이 여러 줄이면 매도는 앞 줄부터 차례로 뺀다. 보유보다 많이 판 기록이면
 *   실제로 있던 수량만큼만 팔고, 예수금도 그만큼만 더한다.
 *   보유하지 않던 종목을 샀으면 새 보유 종목을 만든다 (`currencyFor` 로 통화를 정한다).
 * - 예수금은 실제 체결 가격(`executedPriceOf`, 기록 전이면 시작 시점 가격) × 수량으로 매도 금액을
 *   더하고 매수 금액을 뺀다 (세금·수수료는 계산하지 않는다). 시작할 때
 *   정한 거래 가능 금액이 예수금보다 많았으면 (`cashDelta` > 0) 그만큼 새로 넣은 돈이라 더하고,
 *   적었으면 거래에 쓰지 않고 남겨 둔 돈이라 그대로 둔다.
 *   늘어난 돈은 첫 "예수금" 항목(없으면 첫 현금 항목, 그것도 없으면 새로 만듦)에 더하고, 줄어든 돈은
 *   그 항목부터 빼고 모자라면 나머지 항목에서 순서대로 뺀다. 모든 항목을 0 까지 쓰고도 모자라면
 *   (주문가능금액이 모자란 채로 기록한 매수) 남은 금액을 그 항목에 마이너스로 남긴다.
 */
export function applyRebalancingToAccount(
  account: InvestmentItem,
  session: RebalancingSession,
  currencyFor: (task: RebalancingTask) => string
): AppliedRebalancing {
  let holdings = account.holdings;
  let cashChange = Math.max(0, session.cashDelta);
  const skipped: RebalancingTask[] = [];
  const holdingChanges: HoldingChange[] = [];

  for (const task of session.tasks) {
    if (!task.done && !isPartiallyFilled(task)) continue;
    const tradeQuantity = executedQuantityOf(task);
    const tradePrice = executedPriceOf(task);
    if (tradeQuantity === null || tradePrice === null || tradeQuantity <= 0) {
      skipped.push(task);
      continue;
    }
    const key = stockPriceKey(task.market, task.ticker);
    const existing = holdings.find((h) => stockPriceKey(h.market, h.ticker) === key);

    const tradeValue = tradeQuantity * tradePrice;

    if (task.action === "매도") {
      if (!existing) {
        skipped.push(task);
        continue;
      }
      // 같은 종목이 여러 줄로 있으면 앞 줄부터 차례로 뺀다 (0 아래로는 내려가지 않음).
      const before = sumQuantity(holdings, key);
      let toSell = tradeQuantity;
      holdings = holdings.map((h) => {
        if (toSell <= 0 || stockPriceKey(h.market, h.ticker) !== key) return h;
        const sold = Math.min(h.quantity, toSell);
        toSell -= sold;
        return { ...h, quantity: h.quantity - sold };
      });
      const after = sumQuantity(holdings, key);
      holdingChanges.push({ task, before, after });
      // 보유보다 많이 판 기록이면 실제로 있던 수량만큼만 예수금에 더한다 — 없는 주식의 돈이
      // 생기지 않도록.
      cashChange += (before - after) * tradePrice;
      continue;
    }

    const before = existing?.quantity ?? 0;
    holdingChanges.push({ task, before, after: before + tradeQuantity });
    if (existing) {
      holdings = holdings.map((h) =>
        h.id === existing.id ? { ...h, quantity: h.quantity + tradeQuantity } : h
      );
    } else {
      holdings = [
        ...holdings,
        {
          id: crypto.randomUUID(),
          market: task.market,
          ticker: task.ticker,
          name: task.name,
          currency: currencyFor(task),
          quantity: tradeQuantity,
          memo: "",
        },
      ];
    }
    cashChange -= tradeValue;
  }

  cashChange = Math.round(cashChange);
  const { cashItems, cash, shortfall } = applyCashChange(account, cashChange);
  return {
    account: { ...account, holdings, cashItems },
    cashChange,
    skipped,
    holdingChanges,
    cash,
    cashShortfall: shortfall,
  };
}

function sumQuantity(holdings: StockHolding[], key: string): number {
  return holdings
    .filter((h) => stockPriceKey(h.market, h.ticker) === key)
    .reduce((sum, h) => sum + h.quantity, 0);
}

/**
 * 현금 변화를 항목에 나눠 반영한다. 늘어난 돈은 "예수금" 항목(없으면 첫 항목)에 더한다. 줄어든 돈은
 * 그 항목부터 빼고 모자라면 나머지 항목에서 순서대로 뺀다 — 각 항목은 가진 만큼(0 위의 돈)만 쓴다.
 * 그래도 모자란 금액은 "예수금" 항목에 마이너스(미수)로 남긴다. 항목이 없으면 "예수금" 항목을 만든다.
 */
function applyCashChange(
  account: InvestmentItem,
  change: number
): { cashItems: CashItem[]; cash: CashChange; shortfall: number } {
  const { cashItems } = account;
  const before = sumCash(account);
  const cash = { before, after: before + change };
  const shortfall = Math.max(0, -cash.after);

  if (change === 0) return { cashItems, cash, shortfall };
  const primary = cashItems.find((c) => c.label === DEFAULT_CASH_LABEL) ?? cashItems[0];
  if (!primary) {
    return {
      cashItems: [{ id: crypto.randomUUID(), label: DEFAULT_CASH_LABEL, amount: change }],
      cash,
      shortfall,
    };
  }

  const amounts = new Map<CashItem, number>(cashItems.map((c) => [c, c.amount || 0]));
  if (change > 0) {
    amounts.set(primary, (amounts.get(primary) ?? 0) + change);
  } else {
    let toSpend = -change;
    for (const item of [primary, ...cashItems.filter((c) => c !== primary)]) {
      if (toSpend === 0) break;
      const balance = amounts.get(item) ?? 0;
      const spent = Math.min(Math.max(0, balance), toSpend);
      amounts.set(item, balance - spent);
      toSpend -= spent;
    }
    // 모든 항목을 0 까지 쓰고도 모자란 금액 — 미수처럼 "예수금" 항목에 마이너스로 남긴다.
    if (toSpend > 0) amounts.set(primary, (amounts.get(primary) ?? 0) - toSpend);
  }
  return {
    cashItems: cashItems.map((c) =>
      amounts.get(c) === (c.amount || 0) ? c : { ...c, amount: amounts.get(c) ?? c.amount }
    ),
    cash,
    shortfall,
  };
}
