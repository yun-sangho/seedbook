import type { PortfolioItem } from "../types/types";
import type { RebalancingGapRow, RebalancingSummary } from "./compute-rebalancing-gap";
import { driftPercent } from "./drift-percent";

/** 포트폴리오의 이격 판정 기준 — 계산 방식과 임계값. */
export type DriftRule = Pick<PortfolioItem, "driftMode" | "driftThresholdPercent">;

export interface DriftAlert {
  /** 최대 |이격률| (`rule.driftMode` 기준) — rows 가 비었으면 0. */
  maxAbsGapPercent: number;
  /** 임계값보다 큰 |이격률| 을 가진 행. */
  breachedRows: RebalancingGapRow[];
  /** breachedRows.length > 0 */
  hasBreach: boolean;
}

/** 한 행의 |이격률| 이 임계값을 넘는가 (초과만, 같으면 정상). */
export function isDriftBreached(
  row: Pick<RebalancingGapRow, "targetPercent" | "actualPercent">,
  rule: DriftRule
): boolean {
  return Math.abs(driftPercent(row, rule.driftMode)) > rule.driftThresholdPercent;
}

/**
 * 리밸런싱 summary 에 이격률 임계 판정을 적용한다.
 *
 * `DEFAULT_REBALANCE_THRESHOLD_PERCENT` 는 "유지" action 판정용 (보통 1%p),
 * 여기서는 포트폴리오별 기준으로 "주의가 필요한가?" 를 구분한다.
 */
export function computeDriftAlert(
  summary: Pick<RebalancingSummary, "rows" | "cashRow">,
  rule: DriftRule
): DriftAlert {
  let maxAbsDrift = 0;
  const breached: RebalancingGapRow[] = [];
  // 예수금(목표 0원)도 쌓여 있으면 이격으로 본다.
  const rows = summary.cashRow ? [...summary.rows, summary.cashRow] : summary.rows;
  for (const row of rows) {
    const abs = Math.abs(driftPercent(row, rule.driftMode));
    if (abs > maxAbsDrift) maxAbsDrift = abs;
    if (abs > rule.driftThresholdPercent) breached.push(row);
  }
  return {
    maxAbsGapPercent: maxAbsDrift,
    breachedRows: breached,
    hasBreach: breached.length > 0,
  };
}
