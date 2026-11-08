import type { CashItem, StockHolding } from "../types/types";
import { stockPriceKey, type StockPricePoint } from "./use-stock-prices";

export interface AccountValuation {
  /** 시세가 있는 종목의 close × quantity 합. */
  stocksTotal: number;
  cashTotal: number;
  totalValue: number;
  /** market/ticker 가 채워진 (레거시 아닌) 종목 수. */
  validHoldingCount: number;
  /** 유효 종목 모두 시세를 받았는지. false 면 currentValue 동기화를 미뤄야 한다. */
  allHoldingsHavePrices: boolean;
  /** 받은 시세 중 가장 최근 일자 (YYYY-MM-DD). */
  referenceDate: string | null;
}

export function computeAccountValuation(
  holdings: StockHolding[],
  cashItems: CashItem[],
  prices: Map<string, StockPricePoint>
): AccountValuation {
  const validHoldings = holdings.filter((h) => h.market && h.ticker);

  let stocksTotal = 0;
  let allHoldingsHavePrices = true;
  for (const h of validHoldings) {
    const point = prices.get(stockPriceKey(h.market, h.ticker));
    if (!point) {
      allHoldingsHavePrices = false;
      continue;
    }
    stocksTotal += point.close * h.quantity;
  }

  let referenceDate: string | null = null;
  prices.forEach((p) => {
    if (!referenceDate || p.date > referenceDate) referenceDate = p.date;
  });

  const cashTotal = cashItems.reduce((sum, c) => sum + (c.amount || 0), 0);

  return {
    stocksTotal,
    cashTotal,
    totalValue: stocksTotal + cashTotal,
    validHoldingCount: validHoldings.length,
    allHoldingsHavePrices,
    referenceDate,
  };
}
