import { and, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "./client";
import * as schema from "./schema";

/**
 * 포트폴리오 식물을 서버에서 키운다 (cloud 모드). stock-crawler 가 계좌별 하루 평가
 * (`recordAccountSnapshots`) 를 기록한 뒤 부른다 — 앱을 열지 않아도 목표를 달성한 날 자란다.
 *
 * 규칙은 앱 (`apps/web/features/portfolio/utils/portfolio-plant.ts` 의 `growPlant`) 과 같다: 연결 계좌의
 * 그 날 평가 합이 지금 목표 이상이면 한 단계 자라고, 목표는 비우고 이력에 남긴다. 한 번에 한 단계.
 * 꽃·열매(4) 를 넘지 않는다. 가격을 못 찾은 종목은 평가에서 빠지므로 실제보다 덜 자랄 뿐 더 자라지 않는다.
 *
 * 바뀐 포트폴리오는 version·updatedAt 이 올라 엔티티 동기화 pull 로 기기에 내려간다.
 */

const MAX_PLANT_STAGE = 4;

export interface GrowPortfolioPlantsResult {
  /** 이번에 자란 포트폴리오 수. */
  grown: number;
}

/** `date` (KST, YYYY-MM-DD) 의 계좌 평가로 목표를 달성한 cloud 사용자의 식물을 키운다. */
export async function growPortfolioPlants(
  db: Database,
  date: string,
  now: Date = new Date()
): Promise<GrowPortfolioPlantsResult> {
  const p = schema.portfolio;
  const a = schema.investmentAccount;
  const s = schema.investmentAccountSnapshot;
  const pref = schema.userPreference;

  const values = db
    .select({
      portfolioId: sql<string>`${a.portfolioId}`.as("valuePortfolioId"),
      total: sql<string>`sum(${s.totalValue})`.as("valueTotal"),
    })
    .from(a)
    .innerJoin(s, and(eq(s.accountId, a.id), eq(s.date, date)))
    .innerJoin(pref, and(eq(pref.userId, a.userId), eq(pref.storageMode, "cloud")))
    .where(and(isNull(a.deletedAt), isNotNull(a.portfolioId)))
    .groupBy(a.portfolioId)
    .as("plant_values");

  const reachedAt = now.toISOString();
  const grown = await db
    .update(p)
    .set({
      growthStage: sql`${p.growthStage} + 1`,
      goalHistory: sql`${p.goalHistory} || jsonb_build_array(jsonb_build_object('amount', ${p.goalAmount}, 'reachedAt', ${reachedAt}::text))`,
      goalAmount: null,
      version: sql`${p.version} + 1`,
      updatedAt: now,
    })
    .from(values)
    .where(
      and(
        eq(p.id, values.portfolioId),
        isNull(p.deletedAt),
        isNotNull(p.goalAmount),
        lt(p.growthStage, MAX_PLANT_STAGE),
        gte(values.total, sql`${p.goalAmount}`)
      )
    )
    .returning({ id: p.id });

  return { grown: grown.length };
}
