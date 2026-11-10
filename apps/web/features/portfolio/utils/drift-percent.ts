import type { DriftMode, PortfolioItem } from "../types/types";

/**
 * 이격률 (%). 목표보다 많이 들고 있으면 +, 모자라면 −.
 *
 * - `relative`: (현재 − 목표) ÷ 목표 × 100. 목표 20% 에 현재 25% 면 +25%.
 *   목표가 0 인 행(예수금 등)은 비율을 정의할 수 없어 %p 차이(현재 비중)로 본다.
 * - `absolute`: 현재 − 목표 (%p). 목표 20% 에 현재 25% 면 +5%.
 *
 * `RebalancingGapRow.gapPercent` 는 "얼마나 사야 하나" 관점의 %p 라 부호가 반대(목표 − 현재)다.
 * 이격으로 보여주거나 판정할 때는 이 함수를 쓴다.
 */
export function driftPercent(
  row: { targetPercent: number; actualPercent: number },
  mode: DriftMode
): number {
  const diff = row.actualPercent - row.targetPercent;
  if (mode === "absolute" || row.targetPercent <= 0) return diff;
  return (diff / row.targetPercent) * 100;
}

/** "+6.2%" / "-3.1%" / "0.0%" — 소수 첫째 자리, 반올림해 0 이면 부호를 붙이지 않는다. */
export function formatDriftPercent(value: number): string {
  const rounded = value.toFixed(1);
  if (Number(rounded) === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${rounded}%`;
}

type DriftRuleInput = Pick<PortfolioItem, "driftMode" | "driftThresholdPercent">;

/** 소수 첫째 자리까지, 끝의 0 은 뺀다 (17 / 10.2). */
const formatPercentNumber = (value: number) => String(Number(value.toFixed(1)));

/** 이격 경고 기준을 문장으로. "목표 비중의 15% 넘게 벗어나면" / "비중이 5%p 넘게 차이 나면". */
export function describeDriftRule(rule: DriftRuleInput): string {
  const threshold = formatPercentNumber(rule.driftThresholdPercent);
  return rule.driftMode === "relative"
    ? `목표 비중의 ${threshold}% 넘게 벗어나면`
    : `비중이 ${threshold}%p 넘게 차이 나면`;
}

/**
 * 기준을 실제 숫자로 풀어 쓴 예시의 조각. 화면에서 "목표 20% → 17%~23% 밖이면 경고" 로 쓰고
 * 범위를 강조한다. 범위는 0% ~ 100% 안으로 자르고, 임계값이 0 이면 범위가 없다 (`null` —
 * 조금만 벗어나도 경고).
 */
export function driftRuleExample(
  rule: DriftRuleInput,
  targetPercent: number
): { target: string; range: string | null } {
  const target = `${formatPercentNumber(targetPercent)}%`;
  if (rule.driftThresholdPercent <= 0) return { target, range: null };
  const margin =
    rule.driftMode === "relative"
      ? (targetPercent * rule.driftThresholdPercent) / 100
      : rule.driftThresholdPercent;
  const low = formatPercentNumber(Math.max(0, targetPercent - margin));
  const high = formatPercentNumber(Math.min(100, targetPercent + margin));
  return { target, range: `${low}%~${high}%` };
}

/** 예시에 쓸 목표 비중 — 포트폴리오에서 가장 큰 목표. 양수 목표가 없으면 20%. */
export function exampleTargetPercent(allocations: { targetPercent: number }[]): number {
  const max = Math.max(0, ...allocations.map((a) => a.targetPercent));
  return max > 0 ? max : 20;
}
