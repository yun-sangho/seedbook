import { stockPriceKey } from "@web/features/investments/utils/use-stock-prices";

interface StockKey {
  market: string;
  ticker: string;
}

/** 계좌에 보유한 이 종목의 수량. 같은 종목이 여러 줄이면 더한다. */
export function holdingQuantityFor(
  holdings: readonly (StockKey & { quantity: number })[],
  stock: StockKey
): number {
  const key = stockPriceKey(stock.market, stock.ticker);
  return holdings
    .filter((h) => stockPriceKey(h.market, h.ticker) === key)
    .reduce((sum, h) => sum + h.quantity, 0);
}
