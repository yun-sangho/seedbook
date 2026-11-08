import { db, schema } from "@seedbook/database";
import { and, eq, or, sql } from "drizzle-orm";
import { fetchNaverRealtimeQuotes } from "./naver-realtime";
import { isQuoteStale, type QuoteSnapshot } from "./quote-policy";

/** 네이버 실시간 시세로 조회 가능한 국내 시장. */
const DOMESTIC_MARKETS = new Set(["KOSPI", "KOSDAQ", "KONEX"]);
/** 소스가 느려도 시세 API 전체가 늘어지지 않게 짧게 끊는다. 실패 시 캐시/일봉으로 대체. */
const SOURCE_TIMEOUT_MS = 3000;

export interface StockRef {
  market: string;
  ticker: string;
}

export const stockRefKey = (market: string, ticker: string) => `${market}:${ticker}`;

/**
 * 종목들의 현재가를 `StockQuote` 캐시에서 읽고, 만료된 국내 종목만 네이버에서
 * 새로 받아 캐시에 upsert 한다. 소스 실패는 삼키고 기존 캐시를 돌려준다.
 */
export async function loadQuotes(
  refs: readonly StockRef[],
  now: Date
): Promise<Map<string, QuoteSnapshot>> {
  const domestic = refs.filter((r) => DOMESTIC_MARKETS.has(r.market));
  const quotes = new Map<string, QuoteSnapshot>();
  if (domestic.length === 0) return quotes;

  const cached = await db
    .select()
    .from(schema.stockQuote)
    .where(
      or(
        ...domestic.map((r) =>
          and(eq(schema.stockQuote.market, r.market), eq(schema.stockQuote.ticker, r.ticker))
        )
      )
    );

  const cachedByKey = new Map(cached.map((row) => [stockRefKey(row.market, row.ticker), row]));
  for (const row of cached) {
    quotes.set(stockRefKey(row.market, row.ticker), {
      price: Number(row.price),
      marketStatus: row.marketStatus,
      tradedAt: row.tradedAt,
    });
  }

  const stale = domestic.filter((r) =>
    isQuoteStale(cachedByKey.get(stockRefKey(r.market, r.ticker)) ?? null, now)
  );
  if (stale.length === 0) return quotes;

  const fetched = await fetchNaverRealtimeQuotes(
    stale.map((r) => r.ticker),
    { timeoutMs: SOURCE_TIMEOUT_MS }
  );
  // 네이버는 종목 코드만 안다. 같은 코드를 요청한 market 에 되돌려 붙인다.
  const fetchedByTicker = new Map(fetched.map((q) => [q.ticker, q]));
  const rows = stale.flatMap((r) => {
    const q = fetchedByTicker.get(r.ticker);
    if (!q) return [];
    return [
      {
        market: r.market,
        ticker: r.ticker,
        price: BigInt(Math.round(q.price)),
        marketStatus: q.marketStatus,
        tradedAt: q.tradedAt,
        fetchedAt: now,
      },
    ];
  });
  if (rows.length === 0) return quotes;

  try {
    await db
      .insert(schema.stockQuote)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.stockQuote.market, schema.stockQuote.ticker],
        set: {
          price: sql.raw(`EXCLUDED."price"`),
          marketStatus: sql.raw(`EXCLUDED."marketStatus"`),
          tradedAt: sql.raw(`EXCLUDED."tradedAt"`),
          fetchedAt: sql.raw(`EXCLUDED."fetchedAt"`),
        },
      });
  } catch (err) {
    // 캐시 저장 실패는 이번 응답에 영향을 주지 않는다.
    console.warn("[stock-quotes] quote upsert failed", String(err));
  }

  for (const row of rows) {
    quotes.set(stockRefKey(row.market, row.ticker), {
      price: Number(row.price),
      marketStatus: row.marketStatus,
      tradedAt: row.tradedAt,
    });
  }
  return quotes;
}
