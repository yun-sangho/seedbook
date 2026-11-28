import type { RebalancingTask } from "../types/types";
import { rebalancingTaskStatus } from "./rebalancing-session";

/**
 * 진행 중인 리밸런싱에서 지금 해야 할 한 가지.
 * - `sell`: 주문하지 않은 매도가 있다 — 매도 대금으로 매수하므로 매도가 먼저다.
 * - `buy`: 매도를 모두 주문했고 매수할 차례다. 주문가능금액이 모자라고 더 들어올 매도 대금도
 *   없으면 `shortfall` 만큼 모자란 채로 알린다 (수량을 줄여 기록한다).
 * - `wait`: 체결을 기다린다. `proceeds` 는 매수할 돈이 모자라 매도 체결을, `fill` 은 남은 주문
 *   모두의 체결을 기다린다. `task` 는 체결을 기록할 첫 주문이다.
 * - `done`: 모든 매매를 체결했다.
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
  | { kind: "wait"; reason: "proceeds" | "fill"; task: RebalancingTask; shortfall: number }
  | { kind: "done" };

/**
 * 할 일의 순서(매도 → 매수, 권장 금액 큰 순)대로 지금 할 일을 고른다.
 * `available` 은 지금 주문가능금액 (`rebalancingCashOutlook().now`). 계좌를 몰라 null 이면
 * 금액으로 매수를 막지 않는다.
 */
export function nextRebalancingAction(
  tasks: RebalancingTask[],
  available: number | null
): NextRebalancingAction {
  const pending = tasks.filter((t) => rebalancingTaskStatus(t) === "pending");
  const orderedTasks = tasks.filter((t) => rebalancingTaskStatus(t) === "ordered");

  const sell = pending.find((t) => t.action === "매도");
  if (sell) return { kind: "sell", task: sell, amount: plannedAmount(sell) };

  const buy = pending.find((t) => t.action === "매수");
  if (buy) {
    const amount = plannedAmount(buy);
    const shortfall = available === null ? 0 : Math.max(0, Math.round(amount - available));
    const unfilledSell = orderedTasks.find((t) => t.action === "매도");
    if (shortfall > 0 && unfilledSell) {
      return { kind: "wait", reason: "proceeds", task: unfilledSell, shortfall };
    }
    return { kind: "buy", task: buy, amount, available, shortfall };
  }

  const waiting = orderedTasks[0];
  if (waiting) return { kind: "wait", reason: "fill", task: waiting, shortfall: 0 };
  return { kind: "done" };
}

/** 할 일의 금액 (원) — 권장 수량 × 시작 시점 가격, 시세를 몰랐으면 권장 금액. */
function plannedAmount(task: RebalancingTask): number {
  if (task.quantity !== null && task.price !== null) return task.quantity * task.price;
  return task.amount;
}
