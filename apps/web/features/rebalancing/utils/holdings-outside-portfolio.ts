import type { InvestmentItem } from "@web/features/investments/types/types";
import {
  type StockPricePoint,
  stockPriceKey,
} from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "@web/features/portfolio/types/types";

export interface OutsideHolding {
  name: string;
  ticker: string;
  quantity: number;
  /** 보유 수량 × 최신 시세 (원). 시세를 모르면 null */
  value: number | null;
}

/**
 * 계좌에 있지만 포트폴리오 목표에 없는 보유 종목. 이런 종목은 목표 비중이 없어 리밸런싱
 * 계산에 넣을 수 없다 — 시작 전에 막고, 진행 중이면 계산에서 빼고 알린다.
 *
 * 수량이 0이거나 시장·티커가 없는 예전 기록은 빼고 본다. 같은 종목 여러 줄은 합친다.
 */
export function holdingsOutsidePortfolio(
  account: InvestmentItem,
  portfolio: Pick<PortfolioItem, "allocations">,
  prices: Map<string, StockPricePoint>
): OutsideHolding[] {
  const inPortfolio = new Set(portfolio.allocations.map((a) => stockPriceKey(a.market, a.ticker)));
  const byKey = new Map<string, OutsideHolding>();
  for (const h of account.holdings ?? []) {
    if (!h.market || !h.ticker || !(h.quantity > 0)) continue;
    const key = stockPriceKey(h.market, h.ticker);
    if (inPortfolio.has(key)) continue;
    const existing = byKey.get(key);
    const quantity = (existing?.quantity ?? 0) + h.quantity;
    const price = prices.get(key)?.close;
    byKey.set(key, {
      name: existing?.name || h.name || h.ticker,
      ticker: h.ticker,
      quantity,
      value: price !== undefined ? quantity * price : null,
    });
  }
  return [...byKey.values()];
}
