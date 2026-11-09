/**
 * 보유 종목 정렬 설정. 계좌 상세의 보유 종목, 홈 "종목" 탭, 데스크탑이 같은 값을 쓰고
 * 서버(`user_preference.holdingsSortOption`)에도 저장된다. 의존성이 없어 서버에서도 쓴다.
 */
export const HOLDINGS_SORT_OPTION_VALUES = [
  "evalDesc",
  "evalAsc",
  "priceDesc",
  "priceAsc",
  "nameAsc",
  "nameDesc",
] as const;

export type HoldingsSortOption = (typeof HOLDINGS_SORT_OPTION_VALUES)[number];

/** 기본값 — 평가액 높은 순. */
export const DEFAULT_HOLDINGS_SORT_OPTION: HoldingsSortOption = "evalDesc";

/**
 * 저장된 정렬값을 지금 있는 옵션으로 맞춘다. 없앤 "기본 순서"(`"default"`) 나 모르는 값은
 * 기본값으로 바꾼다 — 브라우저 저장소와 서버에 예전 값이 남아 있을 수 있다.
 */
export function normalizeHoldingsSortOption(value: unknown): HoldingsSortOption {
  return (
    HOLDINGS_SORT_OPTION_VALUES.find((option) => option === value) ?? DEFAULT_HOLDINGS_SORT_OPTION
  );
}
