import type { RebalancingTask } from "../types/types";

export interface PlannedTradeValues {
  /** 할 일마다 보여줄 금액 (원, 반올림). */
  byTaskId: Map<string, number>;
  /** 매수 금액 합 (원) — `byTaskId` 의 매수 값을 더한 것. */
  totalBuy: number;
  /** 매도 금액 합 (원) — `byTaskId` 의 매도 값을 더한 것. */
  totalSell: number;
}

/**
 * 리밸런싱을 시작하기 전에 보여줄 매매 금액 — "리밸런싱 시작" 을 누르면 그대로 할 일이 되는 값이다.
 *
 * 모든 할 일에 예상 수량과 시작 시점 가격이 있으면 수량 × 가격이다. 진행 중 화면의 행 금액과
 * "남은 매매 다 하면" 예수금(`rebalancingCashOutlook.expected`)과 같은 기준이라, 거래 가능 금액에
 * 맞춰 줄인 매수(`buildRebalancingTasks`)도 줄어든 금액으로 보인다 (0주면 0원). 하나라도 수량을
 * 모르면 행마다 기준이 섞이지 않도록 모두 권장 금액(이격 기준)으로 보여준다.
 * 합계는 행 금액을 더해 화면의 행과 맞춘다.
 */
export function plannedTradeValues(tasks: RebalancingTask[]): PlannedTradeValues {
  const byQuantity = tasks.every((task) => task.quantity !== null && task.price !== null);
  const byTaskId = new Map<string, number>();
  let totalBuy = 0;
  let totalSell = 0;
  for (const task of tasks) {
    const value = byQuantity
      ? Math.round((task.quantity ?? 0) * (task.price ?? 0))
      : Math.round(task.amount);
    byTaskId.set(task.id, value);
    if (task.action === "매수") totalBuy += value;
    else totalSell += value;
  }
  return { byTaskId, totalBuy, totalSell };
}
