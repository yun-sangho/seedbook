import {
  type StockPricePoint,
  stockPriceKey,
} from "@mobile/features/investments/utils/use-stock-prices";
import type { RebalancingSummary } from "@mobile/features/portfolio/utils/compute-rebalancing-gap";
import type { RebalancingTask, RebalancingTaskAction } from "../types/types";

/** 매도로 예수금을 먼저 만든 뒤 매수한다. */
const ACTION_ORDER: Record<RebalancingTaskAction, number> = { 매도: 0, 매수: 1 };

/**
 * 리밸런싱 계산 결과(`computeRebalancingGap`)를 할 일 목록으로 스냅샷한다.
 *
 * - "유지" 행과 예수금 행은 할 일이 아니다.
 * - 매도 → 매수 순, 같은 종류 안에서는 금액이 큰 순.
 * - 시세가 있으면 예상 수량을 함께 적는다 (반올림, 실제 주문은 사용자가 조정).
 * - 예수금 행이 있으면, 반올림한 매수 금액이 쓸 수 있는 돈(거래 가능 금액 + 매도 대금)을 넘으면 매수 수량을 줄인다
 *   (`fitBuysToCash`). 넘지 않으면 반올림 그대로다.
 */
export function buildRebalancingTasks(
  summary: RebalancingSummary,
  prices: Map<string, StockPricePoint>
): RebalancingTask[] {
  const tasks: RebalancingTask[] = [];
  for (const row of summary.rows) {
    if (row.action === "유지") continue;
    const amount = Math.round(Math.abs(row.gapValue));
    const point = prices.get(stockPriceKey(row.market, row.ticker));
    const price = point?.close ?? null;
    tasks.push({
      id: row.allocationId,
      market: row.market,
      ticker: row.ticker,
      name: row.name,
      action: row.action,
      amount,
      price,
      quantity: price && price > 0 ? Math.round(amount / price) : null,
      priceAsOf: point?.asOf ?? null,
      priceKind: point?.kind ?? null,
      done: false,
    });
  }

  tasks.sort((a, b) => ACTION_ORDER[a.action] - ACTION_ORDER[b.action] || b.amount - a.amount);
  // 예수금 행(`cashBalance` 를 준 계산)이 있어야 쓸 수 있는 돈을 안다 — 거래 가능 금액
  // (예수금 + cashDelta). 마이너스(미수)면 매도 대금으로 먼저 메운다.
  if (!summary.cashRow) return tasks;
  return fitBuysToCash(tasks, summary.cashRow.actualValue);
}

/** 예상 수량 × 시작 시점 가격. 시세를 몰라 수량이 없으면 0 — 계좌 반영에서도 빠진다. */
const taskCost = (task: RebalancingTask): number => (task.quantity ?? 0) * (task.price ?? 0);

/**
 * 남은 매매를 예상 수량대로 다 했을 때 예수금이 0 아래로 내려가지 않도록 매수 수량을 1주씩 줄인다
 * (`rebalancingCashOutlook.expected` 와 같은 기준: 거래 가능 금액 + 매도 대금 − 매수 금액 ≥ 0).
 *
 * 줄일 매수는 1주 줄였을 때 권장 금액보다 덜 사게 되는 금액(원)이 가장 작은 것 — 즉 목표 비중에서
 * 가장 덜 멀어지는 것 — 이고, 같으면 목록에서 앞에 있는 것 (금액이 큰 것). 반올림으로 올라간 매수가
 * 먼저 줄어든다. 0주까지 줄 수 있고, 그래도 할 일에는 남긴다 (반올림으로 0주가 된 매수와 같다).
 * 매도 수량과 시세 없는 매수는 바꾸지 않는다.
 */
function fitBuysToCash(tasks: RebalancingTask[], cash: number): RebalancingTask[] {
  let available = cash;
  for (const task of tasks) {
    available += task.action === "매도" ? taskCost(task) : -taskCost(task);
  }
  if (available >= 0) return tasks;

  const fitted = [...tasks];
  while (available < 0) {
    let pick = -1;
    let pickShortfall = Number.POSITIVE_INFINITY;
    fitted.forEach((task, index) => {
      if (task.action !== "매수" || !task.quantity || !task.price) return;
      const shortfall = task.amount - (task.quantity - 1) * task.price;
      if (shortfall < pickShortfall) {
        pick = index;
        pickShortfall = shortfall;
      }
    });
    const task = fitted[pick];
    if (!task?.quantity || !task.price) break;
    fitted[pick] = { ...task, quantity: task.quantity - 1 };
    available += task.price;
  }
  return fitted;
}
