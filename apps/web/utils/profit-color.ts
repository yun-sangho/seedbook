/**
 * 수익금/수익률 값에 따른 색상 클래스를 반환합니다.
 * @param value - 수익금 또는 수익률 값
 * @returns Tailwind CSS 색상 클래스 문자열
 * - 양수: 파란색 (text-blue-600)
 * - 0: 기본 색상 (빈 문자열)
 * - 음수: 빨간색 (text-red-600)
 */
export function getProfitColorClass(value: number): string {
  if (value > 0) return "text-blue-600";
  if (value < 0) return "text-red-600";
  return "";
}

/**
 * 수익금 값에 따른 부호 접두사를 반환합니다.
 * @param value - 수익금 값
 * @returns 양수일 경우 "+", 그 외 빈 문자열
 */
export function getProfitPrefix(value: number): string {
  return value > 0 ? "+" : "";
}
