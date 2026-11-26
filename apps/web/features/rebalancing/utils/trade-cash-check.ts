import type { InvestmentItem } from "@web/features/investments/types/types";
import type { RebalancingSession, RebalancingTask, RebalancingTaskAction } from "../types/types";
import { applyRebalancingToAccount } from "./apply-rebalancing-to-account";
import {
  completeRebalancingTaskWith,
  filledQuantityOf,
  rebalancingTaskStatus,
  remainingOrderQuantity,
} from "./rebalancing-session";

/**
 * 계좌에 반영할 때와 같은 계산(`applyRebalancingToAccount`)으로 현금 전체 합(모든 현금 항목)을
 * 구한다 (마이너스일 수 있다). 완료한 매매(기록한 체결 가격)와 시작할 때 넣은 돈이 들어간다. 거래 가능
 * 금액을 예수금보다 적게 잡았으면 남겨 둔 돈은 계좌에는 남지만 매매에 쓸 수 없어 뺀다.
 */
function rawCashAfter(
  account: InvestmentItem,
  session: RebalancingSession,
  tasks: RebalancingTask[]
): number {
  // 통화는 새 보유 종목을 만들 때만 쓰여 예수금 계산과 상관없다.
  const applied = applyRebalancingToAccount(account, { ...session, tasks }, () => "KRW");
  return applied.cash.before + applied.cashChange + Math.min(0, session.cashDelta);
}

/**
 * 체결 전 매수 주문에 묶인 금액 (원) — 증권사의 주문가능금액처럼 예수금에서 미리 뺀다. 부분 체결된
 * 주문은 잔량만 묶는다. 매도 주문은 체결돼야 예수금이 들어오므로 묶지 않는다.
 */
function heldForBuyOrders(tasks: RebalancingTask[], exceptTaskId?: string): number {
  return tasks
    .filter((t) => t.id !== exceptTaskId && t.action === "매수")
    .reduce((sum, t) => sum + remainingOrderQuantity(t) * (t.orderedPrice ?? 0), 0);
}

/** 체결한 매매(부분 체결 포함)를 넣고 체결 전 매수 주문에 묶인 금액을 뺀 쓸 수 있는 예수금. */
function availableCash(
  account: InvestmentItem,
  session: RebalancingSession,
  exceptHoldOf?: string
): number {
  return (
    rawCashAfter(account, session, session.tasks) - heldForBuyOrders(session.tasks, exceptHoldOf)
  );
}

/**
 * 매매 하나를 이 수량·가격으로 체결했다고 기록하기 전/후의 쓸 수 있는 예수금 (원). 수량은 이 매매의
 * 전체 체결 수량이다 — 바로 체결하거나, 체결한 값을 고칠 때 쓴다 (앞선 부분 체결은 이 값에 들어간
 * 것으로 보고 따로 세지 않는다). 주문을 기록할 때도 쓴다 — 매수 주문은 주문 금액만큼 묶여 체결과
 * 같은 값이 되고, 매도 주문은 예수금을 줄이지 않으니 따로 계산하지 않는다.
 * `after` 는 0 아래로 내려갈 수 있다 — 매수로 마이너스가 되면(`buyShortfall`) 모자란 금액을 보여 주고
 * 확인을 받은 뒤 기록한다.
 */
export function tradeCashPreview(
  account: InvestmentItem,
  session: RebalancingSession,
  taskId: string,
  quantity: number,
  price: number
): { before: number; after: number } {
  const reset = {
    ...session,
    tasks: session.tasks.map((t) =>
      t.id === taskId ? { ...t, filledQuantity: 0, filledAmount: 0 } : t
    ),
  };
  const next = completeRebalancingTaskWith(reset, taskId, quantity, price);
  return tradeCashPreviewFor(account, reset, taskId, next);
}

/**
 * 매매 하나를 바꾸기 전/후의 쓸 수 있는 예수금 (원) — `next` 는 바꾼 뒤의 리밸런싱 (주문 체결·부분
 * 체결·정정 등의 결과).
 *
 * `before` 에는 이 매매의 체결 기록(`done`)과 이 매매의 주문에 묶인 금액을 빼고, 다른 체결한 매매와
 * 다른 체결 전 매수 주문에 묶인 금액, 이 매매의 앞선 부분 체결을 넣는다. `after` 는 `next` 그대로 —
 * 부분 체결 뒤 남은 주문이나 정정한 주문은 잔량만큼 다시 묶인다.
 */
export function tradeCashPreviewFor(
  account: InvestmentItem,
  session: RebalancingSession,
  taskId: string,
  next: RebalancingSession
): { before: number; after: number } {
  const base = {
    ...session,
    tasks: session.tasks.map((t) => (t.id === taskId ? { ...t, done: false } : t)),
  };
  return { before: availableCash(account, base, taskId), after: availableCash(account, next) };
}

/**
 * 이 매수로 주문가능금액이 모자라는 금액 (원, 0 이상). 모자란 채로 기록하면 완료할 때 계좌 현금이
 * 그만큼 마이너스(미수)가 된다. 매도는 예수금을 늘리기만 하므로 이미 마이너스여도 0 이다.
 */
export function buyShortfall(
  action: RebalancingTaskAction,
  preview: { before: number; after: number }
): number {
  return action === "매수" ? Math.max(0, -Math.round(preview.after)) : 0;
}

export interface RebalancingCashOutlook {
  /**
   * 지금 쓸 수 있는 예수금 (원) — 시작 시 현금 투입/인출과 체결한 매매(부분 체결 포함)를 넣고,
   * 체결 전 매수 주문에 묶인 금액(부분 체결이면 잔량)을 뺀 값. 0 아래로 내려갈 수 있다.
   */
  now: number;
  /** 체결 전 매수 주문에 묶인 금액 (원). `now` 에서 이미 뺐다. */
  heldForOrders: number;
  /**
   * 남은 매매를 모두 하면 남을 예수금 (원). 주문한 매매는 주문 수량·가격(부분 체결분은 체결한 값), 대기 중인 매매는 권장
   * 수량·시작 시점 가격대로 체결된다고 본다. 시세를 몰랐던 매매는 빠진다.
   */
  expected: number;
}

/**
 * 진행 중인 리밸런싱의 예수금 — 매매를 하나씩 해 나가며 "지금 얼마 남았고, 다 하면 얼마 남는지" 를
 * 본다. 계좌 예수금은 리밸런싱을 완료할 때 반영되므로 진행 중에는 계좌 값에 이 계산을 얹는다.
 */
export function rebalancingCashOutlook(
  account: InvestmentItem,
  session: RebalancingSession
): RebalancingCashOutlook {
  const planned = session.tasks.map((t) => {
    if (t.done) return t;
    if (rebalancingTaskStatus(t) !== "ordered") {
      return { ...t, done: true, executedQuantity: t.quantity, executedPrice: t.price };
    }
    // 앞선 부분 체결은 체결한 값으로, 잔량은 주문가로 체결된다고 본다.
    const remaining = remainingOrderQuantity(t);
    const quantity = filledQuantityOf(t) + remaining;
    const amount = (t.filledAmount ?? 0) + remaining * (t.orderedPrice ?? 0);
    return {
      ...t,
      done: true,
      executedQuantity: quantity,
      executedPrice: quantity > 0 ? amount / quantity : t.orderedPrice,
    };
  });
  const heldForOrders = heldForBuyOrders(session.tasks);
  return {
    now: availableCash(account, session),
    heldForOrders,
    expected: rawCashAfter(account, session, planned),
  };
}
