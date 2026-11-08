import type { InvestmentItem } from "../types/types";

export type AccountSortOption = "default" | "evalDesc" | "evalAsc";

/**
 * 계좌 목록 정렬. `default` 는 사용자가 정한 순서 그대로. 평가액은 저장된
 * `currentValue` 기준 (총 평가금액 요약과 같은 값). 동률은 원래 순서를 유지한다.
 */
export function sortAccounts(
  accounts: InvestmentItem[],
  option: AccountSortOption
): InvestmentItem[] {
  if (option === "default") return accounts;
  const direction = option === "evalDesc" ? -1 : 1;
  return [...accounts].sort((a, b) => direction * ((a.currentValue || 0) - (b.currentValue || 0)));
}
