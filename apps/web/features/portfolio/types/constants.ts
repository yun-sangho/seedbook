import type { DriftMode } from "./types";

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
 * 포트폴리오별로 오버라이드 가능. `driftMode` 로 잰 |이격률| 이 이 값보다 크면 경고 배지 노출.
 */
export const DEFAULT_DRIFT_THRESHOLD_PERCENT = 5;

/** 이격률 계산 방식 표시 이름. */
export const DRIFT_MODE_LABELS: Record<DriftMode, string> = {
  relative: "목표의 %",
  absolute: "비중 차이 %p",
};

/** 새 포트폴리오의 이격률 계산 방식 — 목표 비중의 % (relative). */
export const DEFAULT_DRIFT_MODE: DriftMode = "relative";

/**
 * 계산 방식을 고르기 전에 만든 포트폴리오(값이 없음)의 방식. 그때는 %p 차이로 판정했으므로
 * 같은 임계값이 같은 의미를 갖도록 `absolute` 로 둔다. (서버 컬럼 기본값과 같다.)
 */
export const LEGACY_DRIFT_MODE: DriftMode = "absolute";
