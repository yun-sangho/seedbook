import { prisma } from "@seedbook/database";

import { logger } from "../logger.js";
import { fetchAllStocks } from "../sources/naver.js";

export async function syncStockList(): Promise<void> {
  logger.info("종목 목록 동기화 시작");

  const stocks = await fetchAllStocks();
  const crawledIds = new Set(stocks.map((s) => s.id));

  let upserted = 0;

  for (const stock of stocks) {
    await prisma.stock.upsert({
      where: { id: stock.id },
      create: {
        id: stock.id,
        name: stock.name,
        market: stock.market,
        isActive: true,
      },
      update: {
        name: stock.name,
        market: stock.market,
        isActive: true,
      },
    });
    upserted++;
  }

  const result = await prisma.stock.updateMany({
    where: {
      id: { notIn: [...crawledIds] },
      isActive: true,
    },
    data: { isActive: false },
  });

  logger.info(
    `종목 목록 동기화 완료: ${upserted}개 upsert, ${result.count}개 비활성화`,
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
