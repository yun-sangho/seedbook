import type { HoldingsSortOption } from "../stores/investment-store";
import type { StockHolding } from "../types/types";
import { stockPriceKey } from "./use-stock-prices";

export interface SortPricePoint {
  close: number;
}

/**
 * 보유 주식 목록을 `option` 에 따라 정렬한 새 배열을 반환한다.
 *
 * - `"default"` 이면 원 배열을 그대로 반환 (참조 동일).
 * - 시장/티커가 비어있거나 `prices` 에 해당 가격 데이터가 없는 종목은 항상 맨 뒤로 밀려
 *   정렬 결과에 "구멍" 이 생기지 않는다.
 * - 가격 데이터가 없는 종목들 사이의 상대 순서는 원 배열 순서를 유지한다 (안정 정렬).
 */
export function sortHoldings(
  holdings: StockHolding[],
  prices: Map<string, SortPricePoint>,
  option: HoldingsSortOption
): StockHolding[] {
  if (option === "default") return holdings;

  const getPrice = (h: StockHolding): number | null => {
    if (!h.market || !h.ticker) return null;
    const p = prices.get(stockPriceKey(h.market, h.ticker));
    return p?.close ?? null;
  };
  const getEval = (h: StockHolding): number | null => {
    const price = getPrice(h);
    return price == null ? null : price * h.quantity;
  };

  const keyFn =
    option === "priceDesc" || option === "priceAsc" ? getPrice : getEval;
  const direction = option === "priceDesc" || option === "evalDesc" ? -1 : 1;

  return [...holdings].sort((a, b) => {
    const av = keyFn(a);
    const bv = keyFn(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * direction;
  });
}
