import {
  apnsConfigFromEnv,
  closeDb,
  createApnsSender,
  db,
  kstDateString,
  kstDayOfWeek,
  notifyReachedGoals,
  type PushSender,
} from "@seedbook/database";
import { logger } from "../logger.js";

/**
 * 목표 도달 알림 (`notifyReachedGoals`). 오후 시세 수집·계좌 평가 기록 뒤 부른다 (`scheduler.ts`). APNs 키
 * (`APNS_KEY_ID`·`APNS_PRIVATE_KEY_BASE64`·`APPLE_TEAM_ID`) 가 없으면 건너뛴다. 주말이면 건너뛴다. 실패는 로그만
 * 남기고 던지지 않는다.
 *
 * @param createSender 테스트에서 가짜 발송기를 넣는다.
 */
export async function notifyGoals(
  date?: string,
  createSender: () => PushSender | null = () => {
    const config = apnsConfigFromEnv();
    return config ? createApnsSender(config) : null;
  }
): Promise<boolean> {
  const now = new Date();
  if (date === undefined) {
    const day = kstDayOfWeek(now);
    if (day === 0 || day === 6) return true;
  }
  const target = date ?? kstDateString(now);

  let sender: PushSender | null = null;
  try {
    sender = createSender();
    if (!sender) {
      logger.info("APNs 키 없음, 목표 도달 알림 스킵");
      return true;
    }
    const result = await notifyReachedGoals(db, target, sender, now);
    logger.info(`목표 도달 알림 완료: ${target} KST`, { ...result });
    return true;
  } catch (e) {
    logger.error(`목표 도달 알림 실패: ${target} KST`, { error: String(e) });
    return false;
  } finally {
    sender?.close();
  }
}

// CLI 직접 실행: tsx src/jobs/notify-goals.ts [YYYY-MM-DD]
if (process.argv[1]?.includes("notify-goals")) {
  const dateArg = process.argv[2];
  if (dateArg !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    logger.error(`날짜는 YYYY-MM-DD 로: ${dateArg}`);
    process.exit(1);
  }
  notifyGoals(dateArg)
    .then((ok) => {
      process.exitCode = ok ? 0 : 1;
    })
    .finally(() => closeDb());
}
