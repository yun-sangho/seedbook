import * as cron from "node-cron";

import { logger } from "./logger.js";
import { syncStockList } from "./jobs/sync-stock-list.js";
import { syncStockPrices } from "./jobs/sync-stock-prices.js";

const TIMEZONE = "Asia/Seoul";

// 하루 2회 실행 스케줄
// 1) 06:00 KST — 종목 목록 동기화 (장 시작 전)
// 2) 16:30 KST — 종목 목록 + 일봉 시세 수집 (장 마감 후)
const SCHEDULE_MORNING = process.env.CRON_MORNING ?? "0 6 * * 1-5";
const SCHEDULE_AFTERNOON = process.env.CRON_AFTERNOON ?? "30 16 * * 1-5";

let isRunning = false;

async function runJob(name: string, fn: () => Promise<void>) {
  if (isRunning) {
    logger.warn(`이전 작업이 실행 중이므로 ${name} 건너뜀`);
    return;
  }

  isRunning = true;
  const start = Date.now();

  try {
    await fn();
    logger.info(`${name} 완료 (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  } catch (e) {
    logger.error(`${name} 실패`, { error: String(e) });
  } finally {
    isRunning = false;
  }
}

export function startScheduler() {
  logger.info("크론 스케줄러 시작", {
    morning: SCHEDULE_MORNING,
    afternoon: SCHEDULE_AFTERNOON,
    timezone: TIMEZONE,
  });

  // 오전: 종목 목록만 동기화
  cron.schedule(
    SCHEDULE_MORNING,
    () => {
      void runJob("오전 종목 동기화", syncStockList);
    },
    { timezone: TIMEZONE },
  );

  // 오후: 종목 목록 + 시세 수집
  cron.schedule(
    SCHEDULE_AFTERNOON,
    () => {
      void runJob("오후 전체 크롤링", async () => {
        await syncStockList();
        await syncStockPrices();
      });
    },
    { timezone: TIMEZONE },
  );

  logger.info("스케줄 등록 완료. 대기 중...");
}
