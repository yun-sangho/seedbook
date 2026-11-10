import type { InvestmentItem } from "../types/types";

export const ACCOUNT_SORT_OPTION_VALUES = ["evalDesc", "evalAsc"] as const;

export type AccountSortOption = (typeof ACCOUNT_SORT_OPTION_VALUES)[number];

/** 기본값 — 평가액 높은 순. */
export const DEFAULT_ACCOUNT_SORT_OPTION: AccountSortOption = "evalDesc";

/**
 * 저장된 정렬값을 지금 있는 옵션으로 맞춘다. 없앤 "기본 순서"(`"default"`) 나 모르는 값은
 * 기본값으로 바꾼다 — 브라우저 저장소에 예전 값이 남아 있을 수 있다.
 */
export function normalizeAccountSortOption(value: unknown): AccountSortOption {
  return (
    ACCOUNT_SORT_OPTION_VALUES.find((option) => option === value) ?? DEFAULT_ACCOUNT_SORT_OPTION
  );
}

/**
 * 계좌 목록 정렬. 평가액은 저장된 `currentValue` 기준 (총 평가금액 요약과 같은 값).
 * 동률은 원래 순서를 유지한다.
 */
export function sortAccounts(
  accounts: InvestmentItem[],
  option: AccountSortOption
): InvestmentItem[] {
  const direction = option === "evalDesc" ? -1 : 1;
  return [...accounts].sort((a, b) => direction * ((a.currentValue || 0) - (b.currentValue || 0)));
}
