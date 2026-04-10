import { prisma } from "@seedbook/database";

import { logger } from "../logger.js";
import { fetchAllStockPrices } from "../sources/naver.js";

export async function syncStockPrices(date?: Date): Promise<void> {
  const targetDate = date ?? new Date();
  const dateStr = targetDate.toISOString().slice(0, 10);

  logger.info(`일봉 시세 수집 시작: ${dateStr}`);

  // 활성 종목만 가져오기
  const activeStocks = await prisma.stock.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const stockIds = activeStocks.map((s) => s.id);
  logger.info(`활성 종목 ${stockIds.length}개 시세 수집 시작`);

  const prices = await fetchAllStockPrices(stockIds, targetDate);

  logger.info(`${prices.length}개 시세 데이터 DB 저장 시작`);

  let upserted = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < prices.length; i += BATCH_SIZE) {
    const batch = prices.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map((price) =>
        prisma.stockPrice.upsert({
          where: {
            stockId_date: {
              stockId: price.stockId,
              date: price.date,
            },
          },
          create: price,
          update: {
            open: price.open,
            high: price.high,
            low: price.low,
            close: price.close,
            volume: price.volume,
            marketCap: price.marketCap,
            change: price.change,
          },
        }),
      ),
    );

    upserted += batch.length;
  }

  logger.info(`일봉 시세 수집 완료: ${upserted}개 upsert (${dateStr})`);
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
    .finally(() => prisma.$disconnect());
}
