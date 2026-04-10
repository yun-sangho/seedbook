import { prisma } from "@seedbook/database";

import { logger } from "../logger.js";
import { fetchAllStocks } from "../sources/naver.js";

export async function syncStockList(): Promise<void> {
  logger.info("종목 목록 동기화 시작");

  const stocks = await fetchAllStocks();

  let upserted = 0;

  for (const stock of stocks) {
    await prisma.stock.upsert({
      where: {
        market_ticker: { market: stock.market, ticker: stock.ticker },
      },
      create: {
        market: stock.market,
        ticker: stock.ticker,
        name: stock.name,
        currency: stock.currency,
        isActive: true,
      },
      update: {
        name: stock.name,
        currency: stock.currency,
        isActive: true,
      },
    });
    upserted++;
  }

  // 크롤링된 종목에 없는 기존 활성 종목은 비활성화.
  // 시장 단위로 격리: KOSPI 크롤링 결과가 KOSDAQ 종목을 건드리지 않음.
  const crawledByMarket = new Map<string, string[]>();
  for (const stock of stocks) {
    const list = crawledByMarket.get(stock.market) ?? [];
    list.push(stock.ticker);
    crawledByMarket.set(stock.market, list);
  }

  let deactivated = 0;
  for (const [market, tickers] of crawledByMarket) {
    const result = await prisma.stock.updateMany({
      where: {
        market,
        ticker: { notIn: tickers },
        isActive: true,
      },
      data: { isActive: false },
    });
    deactivated += result.count;
  }

  logger.info(
    `종목 목록 동기화 완료: ${upserted}개 upsert, ${deactivated}개 비활성화`,
  );
}

// CLI 직접 실행
if (process.argv[1]?.includes("sync-stock-list")) {
  syncStockList()
    .catch((e) => {
      logger.error("종목 목록 동기화 실패", { error: String(e) });
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
