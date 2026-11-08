/**
 * 수익 색상 (SEED 토큰 버전). 데스크탑 `getProfitColorClass` 와 같은 규칙:
 * 양수 파랑, 음수 빨강, 0 기본.
 */
export function profitToneClass(value: number): string {
  if (value > 0) return "text-fg-informative";
  if (value < 0) return "text-fg-critical";
  return "text-fg-neutral";
}
