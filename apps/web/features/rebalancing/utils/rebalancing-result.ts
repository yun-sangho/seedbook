import type { InvestmentItem } from "@web/features/investments/types/types";
import { stockPriceKey } from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioAllocation } from "@web/features/portfolio/types/types";
import { sumCash } from "@web/features/portfolio/utils/linked-portfolio-status";
import type { RebalancingResult } from "../types/types";

/** 매매 한 건의 보유 수량 변화 (`applyRebalancingToAccount` 의 `holdingChanges`). */
export interface QuantityChange {
  task: { market: string; ticker: string };
  before: number;
  after: number;
}

/**
 * 리밸런싱을 반영한 계좌의 포트폴리오 종목별 수량·변화량·비중 스냅샷.
 * 비중은 리밸런싱 계산과 같은 기준으로 포트폴리오 종목 + 예수금만 분모에 넣는다
 * (포트폴리오 밖 보유 종목은 제외). 가격을 모르는 보유 종목은 비중 null, 분모에서 빠진다.
 */
export function computeRebalancingResult(
  account: InvestmentItem,
  allocations: PortfolioAllocation[],
  prices: Map<string, number>,
  changes: QuantityChange[],
  /** `cashBefore`: 반영 전 계좌의 예수금 합 — 결과에 예수금 변화를 보여주려고 함께 남긴다. */
  options: { cashBefore?: number } = {}
): RebalancingResult {
  const changeByKey = new Map<string, number>();
  for (const c of changes) {
    const key = stockPriceKey(c.task.market, c.task.ticker);
    changeByKey.set(key, (changeByKey.get(key) ?? 0) + c.after - c.before);
  }

  const seen = new Set<string>();
  const stocks = allocations.flatMap((allocation) => {
    const key = stockPriceKey(allocation.market, allocation.ticker);
    if (seen.has(key)) return [];
    seen.add(key);

    const held = account.holdings.filter((h) => stockPriceKey(h.market, h.ticker) === key);
    const quantity = held.reduce((sum, h) => sum + h.quantity, 0);
    const price = prices.get(key);
    // 보유하지 않은 종목은 시세를 몰라도 0원이다.
    let value: number | null = null;
    if (quantity === 0) value = 0;
    else if (price !== undefined) value = price * quantity;
    return [
      {
        market: allocation.market,
        ticker: allocation.ticker,
        name: held[0]?.name || allocation.name || allocation.ticker,
        quantity,
        change: changeByKey.get(key) ?? 0,
        value,
        targetPercent: allocation.targetPercent,
      },
    ];
  });

  const cash = sumCash(account);
  const total = stocks.reduce((sum, s) => sum + (s.value ?? 0), cash);
  const percentOf = (value: number | null) =>
    value === null || total <= 0 ? null : (value / total) * 100;

  return {
    holdings: stocks.map(({ value, ...s }) => ({ ...s, percent: percentOf(value) })),
    cash,
    cashPercent: percentOf(cash),
    ...(options.cashBefore !== undefined ? { cashBefore: options.cashBefore } : {}),
  };
}
