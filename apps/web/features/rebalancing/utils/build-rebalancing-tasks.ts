import {
  stockPriceKey,
  type StockPricePoint,
} from "@web/features/investments/utils/use-stock-prices";
import type { RebalancingSummary } from "@web/features/portfolio/utils/compute-rebalancing-gap";
import type { RebalancingTask, RebalancingTaskAction } from "../types/types";

/** 매도로 예수금을 먼저 만든 뒤 매수한다. */
const ACTION_ORDER: Record<RebalancingTaskAction, number> = { 매도: 0, 매수: 1 };

/**
 * 리밸런싱 계산 결과(`computeRebalancingGap`)를 할 일 목록으로 스냅샷한다.
 *
 * - "유지" 행과 예수금 행은 할 일이 아니다.
 * - 매도 → 매수 순, 같은 종류 안에서는 금액이 큰 순.
 * - 시세가 있으면 예상 수량을 함께 적는다 (반올림, 실제 주문은 사용자가 조정).
 */
export function buildRebalancingTasks(
  summary: RebalancingSummary,
  prices: Map<string, StockPricePoint>
): RebalancingTask[] {
  const tasks: RebalancingTask[] = [];
  for (const row of summary.rows) {
    if (row.action === "유지") continue;
    const amount = Math.round(Math.abs(row.gapValue));
    const price = prices.get(stockPriceKey(row.market, row.ticker))?.close ?? null;
    tasks.push({
      id: row.allocationId,
      market: row.market,
      ticker: row.ticker,
      name: row.name,
      action: row.action,
      amount,
      price,
      quantity: price && price > 0 ? Math.round(amount / price) : null,
      done: false,
    });
  }

  return tasks.sort(
    (a, b) => ACTION_ORDER[a.action] - ACTION_ORDER[b.action] || b.amount - a.amount
  );
}
