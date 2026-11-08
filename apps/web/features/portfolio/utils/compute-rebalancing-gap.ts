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
  /** 입력된 현재 포트폴리오(주식) 평가액. 예수금은 포함하지 않는다. */
  currentBaseValue: number;
  /** 사용자 입력 cashDelta. 양수=투입, 음수=인출, 0=순수 리밸런싱 */
  cashDelta: number;
  /** max(0, currentBaseValue + cashBalance + cashDelta) — 음수 가지 못하게 clamp */
  newBaseValue: number;
  /** 총 매수 금액 (모든 양수 gapValue 의 합) */
  totalBuyValue: number;
  /** 총 매도 금액 (모든 음수 gapValue 의 절대값 합) */
  totalSellValue: number;
  /** totalBuyValue - totalSellValue. cashDelta 와 일치해야 정상 */
  netCashChange: number;
  /** 100 - sum(targetPercent), 음수면 0 으로 clamp */
  unallocatedPercent: number;
  /**
   * `cashBalance` 옵션을 준 경우의 예수금 행 (목표 0원). 매수 재원이라
   * totalBuy/totalSell 에는 넣지 않지만 이격 판정(`computeDriftAlert`)에는 포함된다.
   */
  cashRow?: RebalancingGapRow;
}

/**
 * 포트폴리오 목표 종목의 현재 평가액 합. 리밸런싱의 기준 금액은 이 값 + 예수금이어야 한다 —
 * 계좌의 모든 주식 평가액을 넣으면, 목표에 없는 종목의 금액까지 목표 종목에 배분되어
 * 권장 매수가 실제로 쓸 수 있는 돈보다 커진다. 같은 종목이 목표에 두 번 있어도 한 번만 더한다.
 */
export function portfolioStockValue(
  allocations: PortfolioAllocation[],
  perStock: Map<string, ActualHoldingValue>
): number {
  const keys = new Set(allocations.map((a) => stockPriceKey(a.market, a.ticker)));
  let total = 0;
  for (const key of keys) total += perStock.get(key)?.value ?? 0;
  return total;
}

export const CASH_ROW_ID = "cash";

interface Options {
  /** |gapPercent| 가 이 값보다 작으면 "유지" 로 판정. 기본 1% */
  actionThresholdPercent?: number;
  /**
   * 리밸런싱 범위(계좌)의 현재 예수금 (원). 주면 예수금도 기준 금액에 넣고 목표 0원으로
   * 본다 — 즉 예수금까지 목표 비중대로 모두 투자하는 계산이 된다. 생략하면 주식만.
   */
  cashBalance?: number;
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
  const cashBalance = options.cashBalance;
  const newBaseValue = Math.max(0, currentBaseValue + (cashBalance ?? 0) + cashDelta);

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

  // 투입/인출을 반영한 뒤의 예수금. 인출이 예수금보다 크면 0 (나머지는 매도로 충당).
  const cashRow =
    cashBalance === undefined
      ? undefined
      : buildCashRow(Math.max(0, cashBalance + cashDelta), newBaseValue);

  return {
    rows,
    cashRow,
    currentBaseValue,
    cashDelta,
    newBaseValue,
    totalBuyValue,
    totalSellValue,
    netCashChange: totalBuyValue - totalSellValue,
    unallocatedPercent,
  };
}

function buildCashRow(cashValue: number, baseValue: number): RebalancingGapRow {
  const actualPercent = baseValue > 0 ? (cashValue / baseValue) * 100 : 0;
  return {
    allocationId: CASH_ROW_ID,
    market: "",
    ticker: "",
    name: "예수금",
    targetPercent: 0,
    actualPercent,
    gapPercent: -actualPercent,
    targetValue: 0,
    actualValue: cashValue,
    gapValue: -cashValue,
    // 예수금은 사고파는 대상이 아니라 매수 재원이다.
    action: "유지",
  };
}
