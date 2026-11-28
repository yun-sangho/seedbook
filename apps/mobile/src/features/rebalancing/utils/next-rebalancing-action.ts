import type { RebalancingTask } from "../types/types";
import { remainingQuantityOf } from "./rebalancing-session";

/**
 * 진행 중인 리밸런싱에서 지금 해야 할 한 가지 (권장일 뿐 — 어느 할 일이든 기록할 수 있다).
 * - `sell`: 끝나지 않은 매도가 있다 — 판 돈으로 사므로 파는 것이 먼저다.
 * - `buy`: 매도가 모두 끝났고 살 차례다. 쓸 수 있는 돈이 모자라면 `shortfall` 만큼 모자란 채로
 *   알린다 (살 수 있는 만큼 기록한다).
 * - `done`: 모든 할 일이 끝났다.
 *
 * 일부만 거래된 할 일은 남은 수량만큼 아직 할 일이다. 예전에 주문만 기록하고 체결되지 않은
 * 할 일도 끝나지 않은 할 일로 본다.
 */
export type NextRebalancingAction =
  | { kind: "sell"; task: RebalancingTask; amount: number }
  | {
      kind: "buy";
      task: RebalancingTask;
      amount: number;
      available: number | null;
      shortfall: number;
    }
  | { kind: "done" };

/**
 * 할 일의 순서대로 지금 할 일을 고른다. `available` 은 지금 쓸 수 있는 돈
 * (`rebalancingCashOutlook().now`). 계좌를 몰라 null 이면 금액으로 매수를 막지 않는다.
 */
export function nextRebalancingAction(
  tasks: RebalancingTask[],
  available: number | null
): NextRebalancingAction {
  const open = tasks.filter((t) => !t.done);

  const sell = open.find((t) => t.action === "매도");
  if (sell) return { kind: "sell", task: sell, amount: remainingAmount(sell) };

  const buy = open.find((t) => t.action === "매수");
  if (!buy) return { kind: "done" };
  const amount = remainingAmount(buy);
  const shortfall = available === null ? 0 : Math.max(0, Math.round(amount - available));
  return { kind: "buy", task: buy, amount, available, shortfall };
}

/** 남은 수량 × 시작 시점 가격 (원). 시세나 수량을 몰랐으면 권장 금액. */
function remainingAmount(task: RebalancingTask): number {
  const remaining = remainingQuantityOf(task);
  if (remaining !== null && task.price !== null) return remaining * task.price;
  return task.amount;
}
