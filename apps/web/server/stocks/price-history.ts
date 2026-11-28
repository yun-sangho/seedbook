import { type Database, schema } from "@seedbook/database";
import { snapshotPriceKey } from "@seedbook/domain/account-snapshot-values";
import { kstDateString } from "@seedbook/domain/kst";
import { and, desc, gte, lt, lte, sql } from "drizzle-orm";

/**
 * `/api/stocks/price-history` 한 요청의 종목 수·기간(일) 상한. 클라이언트
 * (`fill-account-value-history.ts`)는 이보다 작게 나눠 보낸다.
 */
export const MAX_PRICE_HISTORY_ITEMS = 200;
export const MAX_PRICE_HISTORY_DAYS = 366;

export interface StockSymbol {
  market: string;
  ticker: string;
}

export interface DailyClose {
  date: string;
  close: number;
}

/** KST 날짜의 `StockPrice.date` (그 거래일의 KST 자정). */
const kstMidnight = (date: string) => new Date(`${date}T00:00:00+09:00`);

/**
 * 종목별 일별 종가: `from` ~ `to` (KST, 양끝 포함) 의 종가와, `from` 전의 마지막 종가 하나
 * (범위 첫날에 종가가 없을 때 직전 종가로 쓰도록). 날짜 오름차순. 종가가 하나도 없는 종목은 빠진다.
 * key = `snapshotPriceKey(market, ticker)`.
 */
export async function loadDailyCloses(
  db: Database,
  symbols: readonly StockSymbol[],
  from: string,
  to: string
): Promise<Map<string, DailyClose[]>> {
  const result = new Map<string, DailyClose[]>();
  if (symbols.length === 0) return result;

  const sp = schema.stockPrice;
  const pairs = sql.join(
    symbols.map((s) => sql`(${s.market}, ${s.ticker})`),
    sql`, `
  );
  const inSymbols = sql`(${sp.stockMarket}, ${sp.stockTicker}) IN (${pairs})`;
  const columns = {
    market: sp.stockMarket,
    ticker: sp.stockTicker,
    date: sp.date,
    close: sp.close,
  };

  const [before, inRange] = await Promise.all([
    db
      .selectDistinctOn([sp.stockMarket, sp.stockTicker], columns)
      .from(sp)
      .where(and(inSymbols, lt(sp.date, kstMidnight(from))))
      .orderBy(sp.stockMarket, sp.stockTicker, desc(sp.date)),
    db
      .select(columns)
      .from(sp)
      .where(and(inSymbols, gte(sp.date, kstMidnight(from)), lte(sp.date, kstMidnight(to))))
      .orderBy(sp.stockMarket, sp.stockTicker, sp.date),
  ]);

  for (const row of [...before, ...inRange]) {
    const key = snapshotPriceKey(row.market, row.ticker);
    const series = result.get(key) ?? [];
    series.push({ date: kstDateString(row.date), close: Number(row.close) });
    result.set(key, series);
  }
  return result;
}
