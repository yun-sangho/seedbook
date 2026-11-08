/**
 * 포트폴리오 합계 비중 상한 (단위: %).
 * 합이 이 값을 초과하면 validation 에서 하드 에러로 처리한다.
 */
export const MAX_TOTAL_PERCENT = 100;

/**
 * 새 포트폴리오 추가 시 기본 이름 접두어. 사용자가 이름을 입력하지 않으면
 * "포트폴리오 1", "포트폴리오 2" 처럼 번호를 붙인다.
 */
export const DEFAULT_PORTFOLIO_NAME_PREFIX = "포트폴리오";

/**
 * 리밸런싱 권장 액션 판정 기본 임계값 (단위: %).
 * |gapPercent| 가 이 값보다 작으면 "유지" 로 판정한다.
 */
export const DEFAULT_REBALANCE_THRESHOLD_PERCENT = 1;

/**
 * 이격률 경고 기본 임계값 (단위: %).
 * 포트폴리오별로 오버라이드 가능. `|gapPercent|` 가 이 값보다 크면 경고 배지 노출.
 */
export const DEFAULT_DRIFT_THRESHOLD_PERCENT = 5;
