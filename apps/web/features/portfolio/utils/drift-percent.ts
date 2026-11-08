/**
 * 이격률 (%p) = 현재 비중 − 목표 비중. 목표보다 많이 들고 있으면 +, 모자라면 −.
 *
 * `RebalancingGapRow.gapPercent` 는 "얼마나 사야 하나" 관점이라 부호가 반대(목표 − 현재)다.
 * 화면에 이격률로 보여줄 때는 이 함수를 쓴다.
 */
export function driftPercent(row: { targetPercent: number; actualPercent: number }): number {
  return row.actualPercent - row.targetPercent;
}

/** "+6.2%" / "-3.1%" / "0.0%" — 소수 첫째 자리, 반올림해 0 이면 부호를 붙이지 않는다. */
export function formatDriftPercent(value: number): string {
  const rounded = value.toFixed(1);
  if (Number(rounded) === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${rounded}%`;
}
