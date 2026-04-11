import { prisma } from "@seedbook/database";
import { logger } from "../logger.js";
import { fetchAllStockPrices } from "../sources/naver.js";

export async function syncStockPrices(date?: Date): Promise<void> {
  const targetDate = date ?? new Date();
  const dateStr = targetDate.toISOString().slice(0, 10);

  // 주말은 시세 데이터가 없으므로 명시 인자가 없을 때 스킵한다 (불필요한 트래픽 방지).
  // 명시 인자가 있을 경우(예: 스크립트로 과거 특정일 재수집)는 호출자 의도를 신뢰.
  if (date === undefined) {
    const day = targetDate.getDay(); // 0=일, 6=토
    if (day === 0 || day === 6) {
      logger.info(`주말(${dateStr}), 시세 수집 스킵`);
      return;
    }
  }

  logger.info(`일봉 시세 수집 시작: ${dateStr}`);

  // 활성 종목만 가져오기
  const activeStocks = await prisma.stock.findMany({
    where: { isActive: true },
    select: { market: true, ticker: true },
  });

  logger.info(`활성 종목 ${activeStocks.length}개 시세 수집 시작`);

  const prices = await fetchAllStockPrices(activeStocks, targetDate);

  logger.info(`${prices.length}개 시세 데이터 DB 저장 시작`);

  let upserted = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < prices.length; i += BATCH_SIZE) {
    const batch = prices.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map((price) =>
        prisma.stockPrice.upsert({
          where: {
            stockMarket_stockTicker_date: {
              stockMarket: price.stockMarket,
              stockTicker: price.stockTicker,
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
        })
      )
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
