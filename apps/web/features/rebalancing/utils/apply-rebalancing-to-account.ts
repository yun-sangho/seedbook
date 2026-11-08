import type { CashItem, InvestmentItem } from "@web/features/investments/types/types";
import { stockPriceKey } from "@web/features/investments/utils/use-stock-prices";
import type { RebalancingSession, RebalancingTask } from "../types/types";

const DEFAULT_CASH_LABEL = "예수금";

export interface AppliedRebalancing {
  account: InvestmentItem;
  /** 예수금 변화 (원). 매도 - 매수 + 현금 투입/인출 */
  cashChange: number;
  /** 반영하지 못한 할 일 — 시세(예상 수량)가 없었거나, 보유하지 않은 종목의 매도 */
  skipped: RebalancingTask[];
  /** 반영한 매매별 보유 수량 변화 (할 일 순서). 새로 산 종목은 before 0 */
  holdingChanges: HoldingChange[];
  /** 예수금이 반영되는 현금 항목의 잔액 변화. 항목이 없었으면 before 0 */
  cash: CashChange;
}

export interface HoldingChange {
  task: RebalancingTask;
  before: number;
  after: number;
}

export interface CashChange {
  label: string;
  before: number;
  after: number;
}

/**
 * 완료한 리밸런싱의 매매를 계좌에 반영한다.
 *
 * - 체크한 할 일의 예상 수량만큼 보유 수량을 늘리거나 줄인다 (0 아래로 내려가지 않음).
 *   보유하지 않던 종목을 샀으면 새 보유 종목을 만든다 (`currencyFor` 로 통화를 정한다).
 * - 예수금은 시작 시점 시세 × 수량으로 매도 금액을 더하고 매수 금액을 뺀 뒤, 시작할 때
 *   입력한 현금 투입/인출을 더한다. 첫 "예수금" 항목(없으면 첫 현금 항목, 그것도 없으면 새로 만듦)에
 *   반영하며 0 아래로 내려가지 않는다.
 */
export function applyRebalancingToAccount(
  account: InvestmentItem,
  session: RebalancingSession,
  currencyFor: (task: RebalancingTask) => string
): AppliedRebalancing {
  let holdings = account.holdings;
  let cashChange = session.cashDelta;
  const skipped: RebalancingTask[] = [];
  const holdingChanges: HoldingChange[] = [];

  for (const task of session.tasks) {
    if (!task.done) continue;
    if (task.quantity === null || task.price === null || task.quantity <= 0) {
      skipped.push(task);
      continue;
    }
    const key = stockPriceKey(task.market, task.ticker);
    const existing = holdings.find((h) => stockPriceKey(h.market, h.ticker) === key);
    const tradeQuantity = task.quantity;
    const tradeValue = tradeQuantity * task.price;

    if (task.action === "매도") {
      if (!existing) {
        skipped.push(task);
        continue;
      }
      const quantity = Math.max(0, existing.quantity - tradeQuantity);
      holdings = holdings.map((h) => (h.id === existing.id ? { ...h, quantity } : h));
      holdingChanges.push({ task, before: existing.quantity, after: quantity });
      cashChange += tradeValue;
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
  const { cashItems, cash } = applyCashChange(account.cashItems, cashChange);
  return {
    account: { ...account, holdings, cashItems },
    cashChange,
    skipped,
    holdingChanges,
    cash,
  };
}

function applyCashChange(
  cashItems: CashItem[],
  change: number
): { cashItems: CashItem[]; cash: CashChange } {
  const target =
    cashItems.find((c) => c.label === DEFAULT_CASH_LABEL) ?? (cashItems[0] as CashItem | undefined);
  const before = target?.amount ?? 0;
  const after = Math.max(0, before + change);
  const cash = { label: target?.label ?? DEFAULT_CASH_LABEL, before, after };

  if (change === 0) return { cashItems, cash };
  if (!target) {
    return {
      cashItems: [{ id: crypto.randomUUID(), label: DEFAULT_CASH_LABEL, amount: after }],
      cash,
    };
  }
  return {
    cashItems: cashItems.map((c) => (c.id === target.id ? { ...c, amount: after } : c)),
    cash,
  };
}
