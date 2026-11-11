import type { InvestmentItem } from "@web/features/investments/types/types";
import type { RebalancingSession, RebalancingTask } from "../types/types";
import { applyRebalancingToAccount } from "./apply-rebalancing-to-account";
import { rebalancingTaskStatus } from "./rebalancing-session";

/**
 * 계좌에 반영할 때와 같은 계산(`applyRebalancingToAccount`)으로, 예수금 항목의 잔액을 0 으로
 * 자르기 전 값을 구한다. 완료한 매매(기록한 체결 가격)와 시작할 때 넣은 현금 투입/인출이 들어간다.
 */
function rawCashAfter(
  account: InvestmentItem,
  session: RebalancingSession,
  tasks: RebalancingTask[]
): number {
  // 통화는 새 보유 종목을 만들 때만 쓰여 예수금 계산과 상관없다.
  const applied = applyRebalancingToAccount(account, { ...session, tasks }, () => "KRW");
  return applied.cash.before + applied.cashChange;
}

/**
 * 체결 전 매수 주문에 묶인 금액 (원) — 증권사의 주문가능금액처럼 예수금에서 미리 뺀다.
 * 매도 주문은 체결돼야 예수금이 들어오므로 묶지 않는다.
 */
function heldForBuyOrders(tasks: RebalancingTask[], exceptTaskId?: string): number {
  return tasks
    .filter((t) => t.id !== exceptTaskId && t.action === "매수")
    .filter((t) => rebalancingTaskStatus(t) === "ordered")
    .reduce((sum, t) => sum + (t.orderedQuantity ?? 0) * (t.orderedPrice ?? 0), 0);
}

/**
 * 매매 하나를 이 수량·가격으로 기록하기 전/후의 쓸 수 있는 예수금 (원). `after` 는 0 아래로
 * 내려갈 수 있다 — 마이너스면 기록을 막는다.
 *
 * `before` 에는 이 매매를 빼고 다른 체결한 매매와, 다른 체결 전 매수 주문에 묶인 금액을 넣는다
 * (이 매매를 이미 기록했었다면 그 값은 뺀다). `after` 는 이 매매가 체결됐을 때 — 매수는 예수금을
 * 쓰고 매도는 예수금이 들어온다. 매수 주문은 주문 금액만큼 묶여 체결과 같은 값이 되고, 매도 주문은
 * 예수금을 줄이지 않으니 따로 계산하지 않는다.
 */
export function tradeCashPreview(
  account: InvestmentItem,
  session: RebalancingSession,
  taskId: string,
  quantity: number,
  price: number
): { before: number; after: number } {
  const without = session.tasks.map((t) => (t.id === taskId ? { ...t, done: false } : t));
  const held = heldForBuyOrders(session.tasks, taskId);
  const before = rawCashAfter(account, session, without) - held;
  const withTrade = session.tasks.map((t) =>
    t.id === taskId ? { ...t, done: true, executedQuantity: quantity, executedPrice: price } : t
  );
  return { before, after: rawCashAfter(account, session, withTrade) - held };
}

export interface RebalancingCashOutlook {
  /**
   * 지금 쓸 수 있는 예수금 (원) — 시작 시 현금 투입/인출과 체결한 매매를 넣고, 체결 전 매수
   * 주문에 묶인 금액을 뺀 값. 0 아래로 내려갈 수 있다.
   */
  now: number;
  /** 체결 전 매수 주문에 묶인 금액 (원). `now` 에서 이미 뺐다. */
  heldForOrders: number;
  /**
   * 남은 매매를 모두 하면 남을 예수금 (원). 주문한 매매는 주문 수량·가격, 대기 중인 매매는 권장
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
    const ordered = rebalancingTaskStatus(t) === "ordered";
    return {
      ...t,
      done: true,
      executedQuantity: ordered ? t.orderedQuantity : t.quantity,
      executedPrice: ordered ? t.orderedPrice : t.price,
    };
  });
  const heldForOrders = heldForBuyOrders(session.tasks);
  return {
    now: rawCashAfter(account, session, session.tasks) - heldForOrders,
    heldForOrders,
    expected: rawCashAfter(account, session, planned),
  };
}
