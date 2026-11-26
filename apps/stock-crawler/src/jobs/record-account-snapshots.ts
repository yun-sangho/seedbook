import {
  closeDb,
  db,
  kstDateString,
  kstDayOfWeek,
  recordAccountSnapshots,
} from "@seedbook/database";
import { logger } from "../logger.js";

/**
 * 계좌별 하루 평가 기록. 오후 시세 수집 뒤 부른다 (`scheduler.ts`). 날짜를 주지 않으면 오늘 (KST)
 * 이고 주말이면 건너뛴다. 실패는 로그만 남기고 던지지 않는다 — 시세 수집 결과에 영향을 주지 않는다.
 *
 * @param date KST 날짜 (YYYY-MM-DD). 지난 날을 다시 기록할 때.
 */
export async function snapshotAccounts(date?: string): Promise<boolean> {
  const now = new Date();
  if (date === undefined) {
    const day = kstDayOfWeek(now);
    if (day === 0 || day === 6) {
      logger.info(`주말(${kstDateString(now)} KST), 계좌 평가 기록 스킵`);
      return true;
    }
  }
  const target = date ?? kstDateString(now);

  try {
    const start = Date.now();
    const result = await recordAccountSnapshots(db, target);
    logger.info(`계좌 평가 기록 완료: ${target} KST`, {
      ...result,
      seconds: ((Date.now() - start) / 1000).toFixed(1),
    });
    return true;
  } catch (e) {
    logger.error(`계좌 평가 기록 실패: ${target} KST`, { error: String(e) });
    return false;
  }
}

// CLI 직접 실행: tsx src/jobs/record-account-snapshots.ts [YYYY-MM-DD]
if (process.argv[1]?.includes("record-account-snapshots")) {
  const dateArg = process.argv[2];
  if (dateArg !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    logger.error(`날짜는 YYYY-MM-DD 로: ${dateArg}`);
    process.exit(1);
  }

  snapshotAccounts(dateArg)
    .then((ok) => {
      process.exitCode = ok ? 0 : 1;
    })
    .finally(() => closeDb());
}
