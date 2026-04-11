import { numberToKorean } from "./number-format";

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
 * 일반 사용은 `formatProfitKorean` 을 권장하며, 이 함수는 부호만 분리해서
 * 쓸 일이 있을 때 (예: 테이블 컬럼에서 숫자 정렬 위해 별도 span 에 얹을 때) 사용합니다.
 * @param value - 수익금 값
 * @returns 양수 `"+"`, 음수 `"-"`, 0 은 빈 문자열
 */
export function getProfitPrefix(value: number): string {
  if (value > 0) return "+";
  if (value < 0) return "-";
  return "";
}

/**
 * 수익금 값을 `±XX만원` 형태의 한글 문자열로 포맷합니다.
 *
 * 부호는 `getProfitPrefix` 가, 절댓값은 `numberToKorean` 이 담당해서 중복 부호를 피합니다.
 * - 양수: `"+1만원"`
 * - 음수: `"-1만원"`
 * - 0:   `"0원"` (prefix 없음)
 */
export function formatProfitKorean(value: number): string {
  return `${getProfitPrefix(value)}${numberToKorean(Math.abs(value))}`;
}
