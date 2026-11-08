import type { InvestmentItem } from "../types/types";
import { computeAccountValuation } from "./compute-account-valuation";
import type { StockPricePoint } from "./use-stock-prices";

/**
 * 계좌의 지금 평가금액: 보유 종목 × 현재 시세 + 현금. 값을 매길 게 없으면 (보유·현금 모두 없거나
 * 시세를 아직 못 받음) 저장된 `currentValue` 를 쓴다. 계좌 상세·목록·합계가 같은 규칙을 쓴다.
 */
export function liveAccountValue(
  account: InvestmentItem,
  prices: Map<string, StockPricePoint>
): number {
  const { totalValue } = computeAccountValuation(
    account.holdings ?? [],
    account.cashItems ?? [],
    prices
  );
  return totalValue > 0 ? totalValue : account.currentValue;
}

/** `currentValue` 를 지금 평가금액으로 바꾼 계좌 목록 (표시용). 바뀌지 않은 계좌는 그대로 둔다. */
export function withLiveValues(
  accounts: InvestmentItem[],
  prices: Map<string, StockPricePoint>
): InvestmentItem[] {
  return accounts.map((account) => {
    const value = liveAccountValue(account, prices);
    return value === account.currentValue ? account : { ...account, currentValue: value };
  });
}
