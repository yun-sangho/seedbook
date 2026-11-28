import { type SnapshotPrice, snapshotPriceKey } from "@seedbook/domain/account-snapshot-values";
import {
  goalNotificationKey,
  goalReachedMessage,
  isQuietHour,
  plantNotificationLabel,
  type ReachedGoal,
} from "@seedbook/domain/notifications";
import { checkPlantGoal, type GoalCheckAccount } from "@seedbook/domain/plant-goal-check";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { loadPrices } from "../account-snapshots";
import type { Database } from "../client";
import * as schema from "../schema";
import type { PushSender } from "./apns";

/**
 * 목표 도달 알림 (서버 푸시). stock-crawler 가 평일 오후 시세 수집·계좌 평가 기록 뒤 부른다.
 *
 * - 대상은 목표 도달 알림을 켠 기기(`push_device.kinds` 에 `goal`)가 있는 cloud 모드 사용자뿐이다 — 모든 사용자를
 *   매일 계산하지 않는다.
 * - 판단은 앱의 성장 규칙과 같다 (`@seedbook/domain/plant-goal-check`). 식물 필드는 읽기만 한다 — 자라는 것은
 *   앱이 열릴 때 한다.
 * - 같은 수확 주기·단계로는 한 번만 (`push_notification_log.key`), 사용자당 하루 1건, 조용한 시간(21~08시
 *   KST)에는 보내지 않는다. 기록을 먼저 남기고 보낸다 — 실패해도 다시 보내지 않는다 (많이 보내는 것보다 낫다).
 */

export interface NotifyReachedGoalsResult {
  /** 조용한 시간이라 건너뛰었다. */
  quiet: boolean;
  /** 판단한 사용자 수. */
  users: number;
  /** 알림을 보낸 사용자 수. */
  notifiedUsers: number;
  /** 보낸 기기 수. */
  sent: number;
  /** 더는 유효하지 않아 지운 기기 수. */
  removedDevices: number;
}

const GOAL_KIND = "goal";

export async function notifyReachedGoals(
  db: Database,
  date: string,
  sender: PushSender,
  now: Date = new Date()
): Promise<NotifyReachedGoalsResult> {
  const result: NotifyReachedGoalsResult = {
    quiet: false,
    users: 0,
    notifiedUsers: 0,
    sent: 0,
    removedDevices: 0,
  };
  if (isQuietHour(now)) return { ...result, quiet: true };

  const devices = await selectGoalDevices(db);
  const deviceUserIds = [...new Set(devices.map((d) => d.userId))];
  if (deviceUserIds.length === 0) return result;

  // 오늘 이미 알림을 받은 사용자는 건너뛴다 (하루 1건).
  const log = schema.pushNotificationLog;
  const notifiedToday = await db
    .select({ userId: log.userId })
    .from(log)
    .where(and(inArray(log.userId, deviceUserIds), eq(log.date, date)));
  const skip = new Set(notifiedToday.map((r) => r.userId));
  const userIds = deviceUserIds.filter((id) => !skip.has(id));
  result.users = userIds.length;
  if (userIds.length === 0) return result;

  const reachedByUser = await findReachedGoals(db, userIds, date);
  if (reachedByUser.size === 0) return result;

  for (const [userId, reached] of reachedByUser) {
    const message = goalReachedMessage(reached);
    if (!message) continue;
    const inserted = await db
      .insert(log)
      .values(reached.map((r) => ({ userId, key: r.key, kind: GOAL_KIND, date })))
      .onConflictDoNothing()
      .returning({ key: log.key });
    if (inserted.length === 0) continue;

    result.notifiedUsers += 1;
    for (const device of devices.filter((d) => d.userId === userId)) {
      const outcome = await sender.send(device, { ...message, data: { kind: GOAL_KIND } });
      if (outcome === "sent") result.sent += 1;
      if (outcome === "unregistered") {
        await db.delete(schema.pushDevice).where(eq(schema.pushDevice.token, device.token));
        result.removedDevices += 1;
      }
    }
  }
  return result;
}

/** 목표 도달 알림을 켠 cloud 모드 사용자의 기기. */
function selectGoalDevices(db: Database) {
  const d = schema.pushDevice;
  const pref = schema.userPreference;
  return db
    .select({ token: d.token, userId: d.userId, appId: d.appId, environment: d.environment })
    .from(d)
    .innerJoin(pref, and(eq(pref.userId, d.userId), eq(pref.storageMode, "cloud")))
    .where(sql`${GOAL_KIND} = ANY(${d.kinds})`);
}

/** 사용자별로 이번에 다음 목표에 닿은(아직 알리지 않은) 식물. */
async function findReachedGoals(
  db: Database,
  userIds: string[],
  date: string
): Promise<Map<string, (ReachedGoal & { key: string })[]>> {
  const p = schema.portfolio;
  const portfolios = await db
    .select({
      id: p.id,
      userId: p.userId,
      name: p.name,
      plantName: p.plantName,
      goalAmount: p.goalAmount,
      stageGoals: p.stageGoals,
      growthStage: p.growthStage,
      season: p.season,
      fruitGoal: p.fruitGoal,
      driftMode: p.driftMode,
      driftThresholdPercent: p.driftThresholdPercent,
    })
    .from(p)
    .where(and(inArray(p.userId, userIds), isNull(p.deletedAt)));
  const portfolioIds = portfolios.map((row) => row.id);
  if (portfolioIds.length === 0) return new Map();

  const a = schema.investmentAccount;
  const accounts = await db
    .select({ id: a.id, portfolioId: a.portfolioId })
    .from(a)
    .where(
      and(inArray(a.portfolioId, portfolioIds), isNull(a.deletedAt), isNotNull(a.portfolioId))
    );
  const accountIds = accounts.map((row) => row.id);

  const h = schema.stockHolding;
  const c = schema.cashItem;
  const al = schema.portfolioAllocation;
  const [holdings, cashItems, allocations] = await Promise.all([
    accountIds.length === 0
      ? []
      : db
          .select({
            accountId: h.accountId,
            market: h.market,
            ticker: h.ticker,
            quantity: h.quantity,
          })
          .from(h)
          .where(and(inArray(h.accountId, accountIds), isNull(h.deletedAt))),
    accountIds.length === 0
      ? []
      : db
          .select({ accountId: c.accountId, amount: c.amount })
          .from(c)
          .where(and(inArray(c.accountId, accountIds), isNull(c.deletedAt))),
    db
      .select({
        portfolioId: al.portfolioId,
        market: al.market,
        ticker: al.ticker,
        targetPercent: al.targetPercent,
      })
      .from(al)
      .where(and(inArray(al.portfolioId, portfolioIds), isNull(al.deletedAt))),
  ]);

  const priceCache = new Map<string, SnapshotPrice | null>();
  await loadPrices(db, date, holdings, priceCache);
  const priceOf = (market: string, ticker: string) =>
    priceCache.get(snapshotPriceKey(market, ticker))?.close ?? null;

  const log = schema.pushNotificationLog;
  const sentKeys = new Set(
    (
      await db
        .select({ key: log.key })
        .from(log)
        .where(and(inArray(log.userId, userIds), eq(log.kind, GOAL_KIND)))
    ).map((row) => row.key)
  );

  const reachedByUser = new Map<string, (ReachedGoal & { key: string })[]>();
  for (const portfolio of portfolios) {
    const linked: GoalCheckAccount[] = accounts
      .filter((acc) => acc.portfolioId === portfolio.id)
      .map((acc) => ({
        holdings: holdings.filter((row) => row.accountId === acc.id),
        cashAmounts: cashItems
          .filter((row) => row.accountId === acc.id)
          .map((row) => Number(row.amount)),
      }));
    const check = checkPlantGoal(
      portfolio,
      linked,
      allocations.filter((row) => row.portfolioId === portfolio.id),
      portfolio,
      priceOf
    );
    if (!check.reached || check.goalAmount === null) continue;
    const key = goalNotificationKey(portfolio.id, portfolio.season, portfolio.growthStage);
    if (sentKeys.has(key)) continue;
    const list = reachedByUser.get(portfolio.userId) ?? [];
    list.push({
      key,
      label: plantNotificationLabel(portfolio.plantName, portfolio.name),
      goalAmount: check.goalAmount,
      growthStage: portfolio.growthStage,
    });
    reachedByUser.set(portfolio.userId, list);
  }
  return reachedByUser;
}
