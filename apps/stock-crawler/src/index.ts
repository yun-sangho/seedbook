import { closeDb } from "@seedbook/database";
import { syncStockList } from "./jobs/sync-stock-list.js";
import { syncStockPrices } from "./jobs/sync-stock-prices.js";
import { logger } from "./logger.js";
import { isJobRunning, runJob, startScheduler } from "./scheduler.js";

logger.info("stock-crawler 시작");

// RUN_NOW=true 이면 즉시 1회 실행 후 스케줄러 시작.
if (process.env.RUN_NOW === "true") {
  logger.info("즉시 실행 모드 (RUN_NOW=true)");
  void runJob("즉시 실행 (RUN_NOW)", async () => {
    await syncStockList();
    await syncStockPrices();
  }).then(() => {
    logger.info("즉시 실행 완료, 스케줄러 시작");
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
  void shutdown("uncaughtException");
});

// Graceful shutdown — in-flight job 이 있으면 SHUTDOWN_WAIT_MS 까지 완료를 기다린다.
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
    await closeDb();
  } catch (e) {
    logger.warn("DB 연결 종료 중 오류", { error: String(e) });
  }

  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
