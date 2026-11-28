/**
 * 보유 종목 정렬 설정. 계좌 상세의 보유 종목과 "종목" 탭이 같은 값을 쓰고 계정 설정
 * (`user_preference.holdingsSortOption`, `AccountPreferences`)으로 저장된다. 의존성이 없어 서버에서도 쓴다.
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
