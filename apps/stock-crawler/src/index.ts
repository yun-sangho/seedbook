import { prisma } from "@seedbook/database";
import { syncStockList } from "./jobs/sync-stock-list.js";
import { syncStockPrices } from "./jobs/sync-stock-prices.js";
import { logger } from "./logger.js";
import { isJobRunning, startScheduler } from "./scheduler.js";

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
      // 초기 실행 실패해도 스케줄러는 기동한다 (다음 크론에서 재시도).
      startScheduler();
    });
} else {
  startScheduler();
}

// 프로세스 레벨 에러 핸들러 — 단일 미처리 rejection 으로 24/7 프로세스가
// 조용히 죽는 것을 방지한다.
process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", { reason: String(reason) });
});
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", {
    error: String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  // 상태가 불확실하므로 안전하게 재시작(shutdown → Docker restart policy).
  void shutdown("uncaughtException");
});

// Graceful shutdown
// - in-flight job 이 있으면 최대 SHUTDOWN_WAIT_MS 까지 완료를 기다린다.
//   (진행 중인 쿼리 도중 $disconnect 하면 Prisma ERROR 57P01 등으로 로그가
//   지저분해진다.)
// - Prisma 연결을 닫아서 서버 측 abort 를 피한다.
const SHUTDOWN_WAIT_MS = 30_000;
const SHUTDOWN_POLL_MS = 500;

let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`${signal} 수신, 종료 준비`);

  const deadline = Date.now() + SHUTDOWN_WAIT_MS;
  while (isJobRunning() && Date.now() < deadline) {
    logger.info("진행 중인 job 종료 대기...");
    await sleep(SHUTDOWN_POLL_MS);
  }

  if (isJobRunning()) {
    logger.warn(`${SHUTDOWN_WAIT_MS}ms 경과, job 완료를 기다리지 않고 강제 종료`);
  }

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
