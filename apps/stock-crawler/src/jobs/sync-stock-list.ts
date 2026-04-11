import { prisma } from "@seedbook/database";
import { logger } from "../logger.js";
import { fetchAllStocks } from "../sources/naver.js";

const UPSERT_BATCH_SIZE = 100;

// 업스트림이 빈 배열/부분 실패를 돌려줬을 때 "존재하지 않는 종목" 으로 오판하여
// 해당 시장 전체를 비활성화하는 사고를 방지한다. 실제 KOSPI/KOSDAQ 은 수천 개
// 규모이므로 이 임계치보다 작으면 업스트림 이상으로 간주하고 비활성화를 스킵한다.
const MIN_STOCKS_PER_MARKET_FOR_DEACTIVATION = 100;

export async function syncStockList(): Promise<void> {
  logger.info("종목 목록 동기화 시작");

  const stocks = await fetchAllStocks();

  if (stocks.length === 0) {
    logger.warn("크롤 결과 비어있음, 종목 목록 동기화 스킵");
    return;
  }

  // 순차 upsert 는 수천 회 왕복이라 느리고, 중간 프로세스 종료 시 반영이 불균일해진다.
  // sync-stock-prices 와 동일한 패턴으로 병렬 배치 업서트.
  let upserted = 0;
  for (let i = 0; i < stocks.length; i += UPSERT_BATCH_SIZE) {
    const batch = stocks.slice(i, i + UPSERT_BATCH_SIZE);
    await Promise.all(
      batch.map((stock) =>
        prisma.stock.upsert({
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
        })
      )
    );
    upserted += batch.length;
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
    if (tickers.length < MIN_STOCKS_PER_MARKET_FOR_DEACTIVATION) {
      logger.warn(
        `${market} 크롤 결과가 ${tickers.length}개로 비정상 (임계치 ${MIN_STOCKS_PER_MARKET_FOR_DEACTIVATION}), 비활성화 스킵`
      );
      continue;
    }

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

  logger.info(`종목 목록 동기화 완료: ${upserted}개 upsert, ${deactivated}개 비활성화`);
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
