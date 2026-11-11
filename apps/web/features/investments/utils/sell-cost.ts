import type { InvestmentItem } from "../types/types";

/**
 * 매도 대금에서 빠지는 제비용 (원) — 계좌의 매도 제비용률(`sellCostPercent`)로 구하고 원 미만은
 * 버린다. 증권사도 세금·수수료의 원 미만을 절사한다.
 */
export function sellCostOf(account: Pick<InvestmentItem, "sellCostPercent">, proceeds: number) {
  const percent = account.sellCostPercent ?? 0;
  if (percent <= 0 || proceeds <= 0) return 0;
  return Math.floor((proceeds * percent) / 100);
}
