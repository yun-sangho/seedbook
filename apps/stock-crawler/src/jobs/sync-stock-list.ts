import { closeDb, db, schema } from "@seedbook/database";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { fetchAllStocks } from "../sources/naver.js";

const UPSERT_BATCH_SIZE = 100;

// 업스트림이 빈 배열/부분 실패를 돌려줬을 때 "존재하지 않는 종목" 으로 오판하여
// 해당 시장 전체를 비활성화하는 사고를 방지한다.
const MIN_STOCKS_PER_MARKET_FOR_DEACTIVATION = 100;

export async function syncStockList(): Promise<void> {
  logger.info("종목 목록 동기화 시작");

  const stocks = await fetchAllStocks();

  if (stocks.length === 0) {
    logger.warn("크롤 결과 비어있음, 종목 목록 동기화 스킵");
    return;
  }

  const now = new Date();
  let upserted = 0;
  for (let i = 0; i < stocks.length; i += UPSERT_BATCH_SIZE) {
    const batch = stocks.slice(i, i + UPSERT_BATCH_SIZE).map((stock) => ({
      market: stock.market,
      ticker: stock.ticker,
      name: stock.name,
      currency: stock.currency,
      isActive: true,
      updatedAt: now,
    }));
    await db
      .insert(schema.stock)
      .values(batch)
      .onConflictDoUpdate({
        target: [schema.stock.market, schema.stock.ticker],
        set: {
          name: sql.raw(`EXCLUDED."name"`),
          currency: sql.raw(`EXCLUDED."currency"`),
          isActive: sql.raw(`EXCLUDED."isActive"`),
          updatedAt: now,
        },
      });
    upserted += batch.length;
  }

  // 크롤링된 종목에 없는 기존 활성 종목은 비활성화. 시장 단위로 격리.
  const crawledByMarket = new Map<string, string[]>();
  for (const stock of stocks) {
    const list = crawledByMarket.get(stock.market) ?? [];
    list.push(stock.ticker);
    crawledByMarket.set(stock.market, list);
  }

  let deactivated = 0;
  for (const [market, tickers] of crawledByMarket) {
    if (tickers.length < MIN_STOCKS_PER_MARKET_FOR_DEACTIVATION) {
      logger.warn(
        `${market} 크롤 결과가 ${tickers.length}개로 비정상 (임계치 ${MIN_STOCKS_PER_MARKET_FOR_DEACTIVATION}), 비활성화 스킵`,
      );
      continue;
    }

    const result = await db
      .update(schema.stock)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(schema.stock.market, market),
          notInArray(schema.stock.ticker, tickers),
          eq(schema.stock.isActive, true),
        ),
      )
      .returning({ ticker: schema.stock.ticker });
    deactivated += result.length;
  }

  logger.info(`종목 목록 동기화 완료: ${upserted}개 upsert, ${deactivated}개 비활성화`);
}

// CLI 직접 실행
if (process.argv[1]?.includes("sync-stock-list")) {
  syncStockList()
    .catch((e) => {
      logger.error("종목 목록 동기화 실패", { error: String(e) });
      process.exit(1);
    })
    .finally(() => closeDb());
}
