import type { InvestmentItem } from "@web/features/investments/types/types";
import {
  stockPriceKey,
  type StockPricePoint,
} from "@web/features/investments/utils/use-stock-prices";

export interface ActualHoldingValue {
  /** 평가금액 (원) */
  value: number;
  /** 전체 주식 평가금액 대비 비중 (0~100) */
  percent: number;
}

export interface ActualAllocationResult {
  /** key = `${market}:${ticker}` */
  perStock: Map<string, ActualHoldingValue>;
  /** 모든 보유 종목의 평가금액 합계 (원). 가격 없는 종목은 제외됨. */
  totalStockValue: number;
}

/**
 * `features/investments` 의 보유 종목 데이터와 최신 가격 정보로부터
 * 종목별 실제 평가금액과 전체 대비 비중을 계산한다.
 *
 * - 가격을 가져올 수 없는 종목 (`prices` 에 없거나 market/ticker 가 비어있음)
 *   은 합계에서 제외된다.
 * - 같은 종목을 여러 계좌에 나눠 보유한 경우 수량을 합산한다.
 * - 수량이 0 이하인 holding 도 제외 (실제 보유가 아님).
 */
export function computeActualAllocation(
  investments: InvestmentItem[],
  prices: Map<string, StockPricePoint>
): ActualAllocationResult {
  const aggregated = new Map<string, { value: number }>();
  let totalStockValue = 0;

  for (const inv of investments) {
    for (const h of inv.holdings ?? []) {
      if (!h.market || !h.ticker) continue;
      if (!h.quantity || h.quantity <= 0) continue;
      const key = stockPriceKey(h.market, h.ticker);
      const price = prices.get(key);
      if (!price) continue;
      const value = h.quantity * price.close;
      const existing = aggregated.get(key);
      if (existing) {
        existing.value += value;
      } else {
        aggregated.set(key, { value });
      }
      totalStockValue += value;
    }
  }

  const perStock = new Map<string, ActualHoldingValue>();
  for (const [key, { value }] of aggregated) {
    const percent = totalStockValue > 0 ? (value / totalStockValue) * 100 : 0;
    perStock.set(key, { value, percent });
  }

  return { perStock, totalStockValue };
}
