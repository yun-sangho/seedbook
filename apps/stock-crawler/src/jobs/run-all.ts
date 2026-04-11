import { prisma } from "@seedbook/database";
import { logger } from "../logger.js";
import { syncStockList } from "./sync-stock-list.js";
import { syncStockPrices } from "./sync-stock-prices.js";

async function runAll() {
  logger.info("전체 크롤링 시작");

  await syncStockList();
  await syncStockPrices();

  logger.info("전체 크롤링 완료");
}

runAll()
  .catch((e) => {
    logger.error("크롤링 실패", { error: String(e) });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
