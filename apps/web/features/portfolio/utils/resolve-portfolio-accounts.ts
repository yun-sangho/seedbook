import type { InvestmentItem } from "@web/features/investments/types/types";
import type { PortfolioItem } from "../types/types";

/**
 * 포트폴리오가 적용될 실제 계좌 목록을 반환한다.
 *
 * - `accountIds` 가 비어 있으면 "연결 없음 = 전체 합산" 으로 간주하고 모든 계좌를 반환.
 * - 비어있지 않으면 해당 id 들로 필터링. 존재하지 않는 id 는 조용히 제외.
 */
export function resolvePortfolioAccounts(
  portfolio: Pick<PortfolioItem, "accountIds">,
  investments: InvestmentItem[]
): InvestmentItem[] {
  if (portfolio.accountIds.length === 0) return investments;
  const idSet = new Set(portfolio.accountIds);
  return investments.filter((inv) => idSet.has(inv.id));
}
