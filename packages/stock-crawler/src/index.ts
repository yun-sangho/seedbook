import { prisma } from "@seedbook/database";

import { logger } from "./logger.js";
import { startScheduler } from "./scheduler.js";
import { syncStockList } from "./jobs/sync-stock-list.js";
import { syncStockPrices } from "./jobs/sync-stock-prices.js";

logger.info("stock-crawler 시작");

// RUN_NOW=true 이면 즉시 1회 실행 후 스케줄러 시작
if (process.env.RUN_NOW === "true") {
  logger.info("즉시 실행 모드 (RUN_NOW=true)");
  syncStockList()
    .then(() => syncStockPrices())
    .then(() => {
      logger.info("즉시 실행 완료, 스케줄러 시작");
      startScheduler();
    })
    .catch((e) => {
      logger.error("즉시 실행 실패", { error: String(e) });
      startScheduler();
    });
} else {
  startScheduler();
}

// Graceful shutdown: Prisma 연결을 닫아서 in-flight 쿼리가 서버 측 강제 종료로
// abort되는 것(ERROR 57P01)을 방지.
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`${signal} 수신, 종료합니다.`);
  try {
    await prisma.$disconnect();
  } catch (e) {
    logger.warn("Prisma 연결 종료 중 오류", { error: String(e) });
  }
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
