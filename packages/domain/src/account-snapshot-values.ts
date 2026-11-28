/**
 * 계좌 하루 평가의 순수 계산. 서버 기록(`account-snapshots.ts`)과 기기 기록(local 모드, web
 * `features/investments/utils/account-value-history.ts`)이 같은 식을 쓴다. database 패키지 dist 가
 * node 로 바로 불러오므로 import 없는 파일로 둔다 (`node-leaf-modules.test.ts`).
 */

export interface SnapshotHolding {
  market: string;
  ticker: string;
  quantity: number;
}

/** 종목의 종가와 그 거래일 (KST, YYYY-MM-DD). */
export interface SnapshotPrice {
  close: number;
  date: string;
}

export interface AccountSnapshotValues {
  stockValue: number;
  cashValue: number;
  totalValue: number;
  holdingCount: number;
  missingPriceCount: number;
  oldestPriceDate: string | null;
}

export function snapshotPriceKey(market: string, ticker: string): string {
  return `${market}:${ticker}`;
}

/**
 * 계좌 하나의 평가: 종목코드가 있는 보유 종목 × 종가 + 현금 합. 종목코드가 비어 있는 옛 보유 항목은
 * 화면(`computeAccountValuation`)처럼 세지 않는다. 가격을 못 찾은 종목은 평가에서 빠지고
 * `missingPriceCount` 로 남는다. 종목마다 원 단위로 반올림한다.
 */
export function computeAccountSnapshot(
  holdings: SnapshotHolding[],
  cashAmounts: number[],
  prices: ReadonlyMap<string, SnapshotPrice>
): AccountSnapshotValues {
  let stockValue = 0;
  let holdingCount = 0;
  let missingPriceCount = 0;
  let oldestPriceDate: string | null = null;

  for (const h of holdings) {
    if (!h.market || !h.ticker) continue;
    holdingCount += 1;
    const price = prices.get(snapshotPriceKey(h.market, h.ticker));
    if (!price) {
      missingPriceCount += 1;
      continue;
    }
    stockValue += Math.round(price.close * h.quantity);
    if (oldestPriceDate === null || price.date < oldestPriceDate) oldestPriceDate = price.date;
  }

  const cashValue = cashAmounts.reduce((sum, amount) => sum + amount, 0);

  return {
    stockValue,
    cashValue,
    totalValue: stockValue + cashValue,
    holdingCount,
    missingPriceCount,
    oldestPriceDate,
  };
}
