import type { InvestmentItem } from "../types/types";
import { stockPriceKey } from "./use-stock-prices";

export interface HoldingAccountShare {
  id: string;
  name: string;
  color: string;
  quantity: number;
}

/** 여러 계좌에 흩어진 같은 종목을 합친 한 줄. */
export interface AggregatedHolding {
  /** 목록 key. 시장·티커가 있으면 `market:ticker`, 레거시(이름만)는 보유 항목 id. */
  key: string;
  name: string;
  quantity: number;
  /** 주당 가격 (원). 시세가 없으면 null */
  price: number | null;
  /** 평가금액 (원). 시세가 없으면 null */
  value: number | null;
  /** 이 종목을 가진 계좌 (계좌 목록 순서) */
  accounts: HoldingAccountShare[];
}

/**
 * 모든 계좌의 보유 종목을 종목(시장·티커) 단위로 합친다. 평가금액 큰 순,
 * 시세가 없는 종목은 맨 뒤 (그 사이에선 처음 나온 순서).
 * 시장·티커가 없는 레거시 항목은 같은 종목인지 알 수 없어 합치지 않는다.
 */
export function aggregateHoldings(
  accounts: InvestmentItem[],
  prices: Map<string, { close: number }>
): AggregatedHolding[] {
  const byKey = new Map<string, AggregatedHolding>();

  for (const account of accounts) {
    for (const h of account.holdings ?? []) {
      const priceKey = h.market && h.ticker ? stockPriceKey(h.market, h.ticker) : null;
      const key = priceKey ?? h.id;
      const row = byKey.get(key) ?? {
        key,
        name: h.name || h.ticker || "(미지정)",
        quantity: 0,
        price: priceKey ? (prices.get(priceKey)?.close ?? null) : null,
        value: null,
        accounts: [],
      };
      row.quantity += h.quantity;
      const share = row.accounts.find((a) => a.id === account.id);
      if (share) share.quantity += h.quantity;
      else
        row.accounts.push({
          id: account.id,
          name: account.accountName,
          color: account.color,
          quantity: h.quantity,
        });
      byKey.set(key, row);
    }
  }

  const rows = [...byKey.values()].map((row) => ({
    ...row,
    value: row.price === null ? null : row.price * row.quantity,
  }));
  return rows.sort((a, b) => {
    if (a.value === null && b.value === null) return 0;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return b.value - a.value;
  });
}
