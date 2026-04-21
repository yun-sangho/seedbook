import type { RebalancingGapRow, RebalancingSummary } from "./compute-rebalancing-gap";

export interface DriftAlert {
  /** 최대 |gapPercent| — rows 가 비었으면 0. */
  maxAbsGapPercent: number;
  /** threshold 보다 큰 |gapPercent| 를 가진 행. */
  breachedRows: RebalancingGapRow[];
  /** breachedRows.length > 0 */
  hasBreach: boolean;
}

/**
 * 리밸런싱 summary 에 이격률 임계 판정을 적용한다.
 *
 * `DEFAULT_REBALANCE_THRESHOLD_PERCENT` 는 "유지" action 판정용 (보통 1%),
 * 여기서는 더 큰 사용자 정의 임계(기본 5%)로 "주의가 필요한가?" 를 구분한다.
 */
export function computeDriftAlert(
  summary: Pick<RebalancingSummary, "rows">,
  thresholdPercent: number
): DriftAlert {
  let maxAbsGap = 0;
  const breached: RebalancingGapRow[] = [];
  for (const row of summary.rows) {
    const abs = Math.abs(row.gapPercent);
    if (abs > maxAbsGap) maxAbsGap = abs;
    if (abs > thresholdPercent) breached.push(row);
  }
  return {
    maxAbsGapPercent: maxAbsGap,
    breachedRows: breached,
    hasBreach: breached.length > 0,
  };
}
