import type { HoldingsSortOption } from "../types/holdings-sort";
import type { StockHolding } from "../types/types";
import { stockPriceKey } from "./use-stock-prices";

export { DEFAULT_HOLDINGS_SORT_OPTION, normalizeHoldingsSortOption } from "../types/holdings-sort";

export interface SortPricePoint {
  close: number;
}

/** 정렬에 쓰는 값. 가격·평가액을 모르면 null. */
export interface HoldingSortKeys {
  name: string;
  price: number | null;
  value: number | null;
}

const nameCollator = new Intl.Collator("ko");

/**
 * 목록을 `option` 에 따라 정렬한 새 배열을 반환한다 (안정 정렬).
 *
 * - 이름 순은 가격과 상관없이 이름으로만 정렬한다 (한국어 순서: 한글 가나다 → 영문).
 * - 가격·평가액 순에서 값을 모르는 항목은 방향과 상관없이 맨 뒤로 가고, 그 사이에선 원래 순서를 유지한다.
 */
export function sortByHoldingsOption<T>(
  items: readonly T[],
  option: HoldingsSortOption,
  keysOf: (item: T) => HoldingSortKeys
): T[] {
  if (option === "nameAsc" || option === "nameDesc") {
    const direction = option === "nameAsc" ? 1 : -1;
    return [...items].sort(
      (a, b) => direction * nameCollator.compare(keysOf(a).name, keysOf(b).name)
    );
  }

  const byPrice = option === "priceDesc" || option === "priceAsc";
  const direction = option === "priceDesc" || option === "evalDesc" ? -1 : 1;
  const keyOf = (item: T) => (byPrice ? keysOf(item).price : keysOf(item).value);

  return [...items].sort((a, b) => {
    const av = keyOf(a);
    const bv = keyOf(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * direction;
  });
}

/**
 * 보유 주식 목록을 `option` 에 따라 정렬한 새 배열을 반환한다.
 * 시장/티커가 비어있거나 `prices` 에 가격이 없는 종목은 가격을 모르는 것으로 본다.
 */
export function sortHoldings(
  holdings: StockHolding[],
  prices: Map<string, SortPricePoint>,
  option: HoldingsSortOption
): StockHolding[] {
  return sortByHoldingsOption(holdings, option, (h) => {
    const price =
      h.market && h.ticker ? (prices.get(stockPriceKey(h.market, h.ticker))?.close ?? null) : null;
    return {
      name: h.name || h.ticker,
      price,
      value: price === null ? null : price * h.quantity,
    };
  });
}
