import { closeDb, db, kstDateString, kstDayOfWeek, schema } from "@seedbook/database";
import { eq, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { fetchAllStockPrices } from "../sources/naver.js";

export async function syncStockPrices(date?: Date): Promise<void> {
  const targetDate = date ?? new Date();
  const kstDay = kstDateString(targetDate);

  if (date === undefined) {
    const day = kstDayOfWeek(targetDate);
    if (day === 0 || day === 6) {
      logger.info(`주말(${kstDay} KST), 시세 수집 스킵`);
      return;
    }
  }

  logger.info(`일봉 시세 수집 시작: ${kstDay} KST`);

  // 활성 종목만 가져오기
  const activeStocks = await db
    .select({ market: schema.stock.market, ticker: schema.stock.ticker })
    .from(schema.stock)
    .where(eq(schema.stock.isActive, true));

  logger.info(`활성 종목 ${activeStocks.length}개 시세 수집 시작`);

  const prices = await fetchAllStockPrices(activeStocks, targetDate);

  logger.info(`${prices.length}개 시세 데이터 DB 저장 시작`);

  let upserted = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < prices.length; i += BATCH_SIZE) {
    const batch = prices.slice(i, i + BATCH_SIZE);

    await db
      .insert(schema.stockPrice)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          schema.stockPrice.stockMarket,
          schema.stockPrice.stockTicker,
          schema.stockPrice.date,
        ],
        set: {
          open: sql.raw(`EXCLUDED."open"`),
          high: sql.raw(`EXCLUDED."high"`),
          low: sql.raw(`EXCLUDED."low"`),
          close: sql.raw(`EXCLUDED."close"`),
          volume: sql.raw(`EXCLUDED."volume"`),
          marketCap: sql.raw(`EXCLUDED."marketCap"`),
          change: sql.raw(`EXCLUDED."change"`),
        },
      });

    upserted += batch.length;
  }

  logger.info(`일봉 시세 수집 완료: ${upserted}개 upsert (${kstDay} KST)`);
}

// CLI 직접 실행
if (process.argv[1]?.includes("sync-stock-prices")) {
  const dateArg = process.argv[2];
  const date = dateArg ? new Date(dateArg) : undefined;

  syncStockPrices(date)
    .catch((e) => {
      logger.error("일봉 시세 수집 실패", { error: String(e) });
      process.exit(1);
    })
    .finally(() => closeDb());
}
