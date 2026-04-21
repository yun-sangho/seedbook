/**
 * 포트폴리오 합계 비중 상한 (단위: %).
 * 합이 이 값을 초과하면 validation 에서 하드 에러로 처리한다.
 */
export const MAX_TOTAL_PERCENT = 100;

/**
 * 새 포트폴리오 추가 시 기본 이름 후보.
 * 사용자가 따로 입력하지 않을 때 순환 사용한다.
 */
export const DEFAULT_PORTFOLIO_NAMES = [
  "안정형",
  "공격형",
  "성장형",
  "배당형",
  "AI 테마",
  "반도체 집중",
  "균형형",
];

/**
 * 리밸런싱 권장 액션 판정 기본 임계값 (단위: %).
 * |gapPercent| 가 이 값보다 작으면 "유지" 로 판정한다.
 */
export const DEFAULT_REBALANCE_THRESHOLD_PERCENT = 1;
