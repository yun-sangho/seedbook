import { stockPriceKey } from "@web/features/investments/utils/use-stock-prices";
import { DEFAULT_REBALANCE_THRESHOLD_PERCENT, MAX_TOTAL_PERCENT } from "../types/constants";
import type { PortfolioAllocation } from "../types/types";
import type { ActualHoldingValue } from "./compute-actual-allocation";

export type RebalancingAction = "매수" | "매도" | "유지";

export interface RebalancingGapRow {
  allocationId: string;
  market: string;
  ticker: string;
  name: string;
  /** 사용자가 정의한 목표 비중 (%) */
  targetPercent: number;
  /** newBaseValue 기준 현재 보유 비중 (%) */
  actualPercent: number;
  /** target - actual (%). 양수 = 매수, 음수 = 매도 */
  gapPercent: number;
  /** newBaseValue × targetPercent / 100 (원) */
  targetValue: number;
  /** 현재 평가금액 (원) */
  actualValue: number;
  /** target - actual (원). 양수 = 매수, 음수 = 매도 */
  gapValue: number;
  action: RebalancingAction;
}

export interface RebalancingSummary {
  rows: RebalancingGapRow[];
  /** 입력된 현재 포트폴리오(주식) 평가액 */
  currentBaseValue: number;
  /** 사용자 입력 cashDelta. 양수=투입, 음수=인출, 0=순수 리밸런싱 */
  cashDelta: number;
  /** max(0, currentBaseValue + cashDelta) — 음수 가지 못하게 clamp */
  newBaseValue: number;
  /** 총 매수 금액 (모든 양수 gapValue 의 합) */
  totalBuyValue: number;
  /** 총 매도 금액 (모든 음수 gapValue 의 절대값 합) */
  totalSellValue: number;
  /** totalBuyValue - totalSellValue. cashDelta 와 일치해야 정상 */
  netCashChange: number;
  /** 100 - sum(targetPercent), 음수면 0 으로 clamp */
  unallocatedPercent: number;
}

interface Options {
  /** |gapPercent| 가 이 값보다 작으면 "유지" 로 판정. 기본 1% */
  actionThresholdPercent?: number;
}

/**
 * 포트폴리오 목표 비중과 실제 보유 종목 평가액으로 리밸런싱 권장 액션을 계산.
 *
 * `cashDelta` 를 통해 현금 추가 투입(양수) / 인출(음수) 시뮬레이션을 지원한다.
 * - cashDelta = 0 : 순수 리밸런싱 (totalBuy ≈ totalSell)
 * - cashDelta > 0 : 추가 투입. 매수 위주
 * - cashDelta < 0 : 인출. 매도 위주
 *
 * 목표 행만 iterate 하므로 보유 중이지만 allocations 에 없는 종목은 결과에 포함되지
 * 않는다 (UI 단에서 별도 안내가 필요할 수 있음).
 */
export function computeRebalancingGap(
  allocations: PortfolioAllocation[],
  perStock: Map<string, ActualHoldingValue>,
  currentBaseValue: number,
  cashDelta: number,
  options: Options = {}
): RebalancingSummary {
  const threshold = options.actionThresholdPercent ?? DEFAULT_REBALANCE_THRESHOLD_PERCENT;
  const newBaseValue = Math.max(0, currentBaseValue + cashDelta);

  let totalBuyValue = 0;
  let totalSellValue = 0;

  const rows: RebalancingGapRow[] = allocations.map((a) => {
    const key = stockPriceKey(a.market, a.ticker);
    const actualValue = perStock.get(key)?.value ?? 0;
    const targetValue = (newBaseValue * a.targetPercent) / 100;
    const gapValue = targetValue - actualValue;
    const actualPercent = newBaseValue > 0 ? (actualValue / newBaseValue) * 100 : 0;
    const gapPercent = a.targetPercent - actualPercent;

    let action: RebalancingAction;
    if (gapValue === 0 || Math.abs(gapPercent) < threshold) {
      // newBaseValue 가 0 이면 모든 gapValue 가 0 — 액션할 것이 없음
      action = "유지";
    } else if (gapValue > 0) {
      action = "매수";
      totalBuyValue += gapValue;
    } else {
      action = "매도";
      totalSellValue += -gapValue;
    }

    return {
      allocationId: a.id,
      market: a.market,
      ticker: a.ticker,
      name: a.name,
      targetPercent: a.targetPercent,
      actualPercent,
      gapPercent,
      targetValue,
      actualValue,
      gapValue,
      action,
    };
  });

  const targetSum = allocations.reduce((acc, a) => acc + (a.targetPercent || 0), 0);
  const unallocatedPercent = Math.max(0, MAX_TOTAL_PERCENT - targetSum);

  return {
    rows,
    currentBaseValue,
    cashDelta,
    newBaseValue,
    totalBuyValue,
    totalSellValue,
    netCashChange: totalBuyValue - totalSellValue,
    unallocatedPercent,
  };
}
