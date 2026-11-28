import { type Database, schema } from "@seedbook/database";
import {
  type PortfolioData,
  type PortfolioFields,
  parsePortfolioFields,
  portfolioAllocationRows,
  portfolioFieldsToColumns,
  portfolioRowToData,
} from "@seedbook/domain/v1/portfolio-record";
import { createEntityRepo, selectRowsByIds } from "@web/server/sync/entity-repo";
import type { SyncEntity } from "@web/server/sync/registry";
import type { MutationResult } from "@web/server/sync/types";
import { linkPortfolioAccounts, replaceChildren } from "@web/server/sync/v1-changeseq";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

type PortfolioRow = typeof schema.portfolio.$inferSelect;

const p = schema.portfolio;
// 들어온 식물 진행이 저장된 것만큼 자랐다 — 그때만 들어온 목표·이력을 쓴다.
const incomingPlantIsCurrent = sql`excluded."growthStage" >= ${p.growthStage}`;

/**
 * 식물의 도달 단계는 내려가지 않는다. 오래된 기기가 덜 자란 식물을 보내면 (서버·다른 기기가 이미
 * 키웠다) 저장된 목표·단계·이력을 그대로 두고 나머지 필드만 덮어쓴다.
 */
function keepFurtherPlant(columns: Record<string, unknown>): Record<string, unknown> {
  if (columns.growthStage === undefined) return columns;
  return {
    ...columns,
    growthStage: sql`GREATEST(${p.growthStage}, excluded."growthStage")`,
    goalAmount: sql`CASE WHEN ${incomingPlantIsCurrent} THEN excluded."goalAmount" ELSE ${p.goalAmount} END`,
    goalHistory: sql`CASE WHEN ${incomingPlantIsCurrent} THEN excluded."goalHistory" ELSE ${p.goalHistory} END`,
  };
}

export const portfolioRepo = createEntityRepo<PortfolioFields, PortfolioData>({
  table: schema.portfolio,
  toColumns: portfolioFieldsToColumns,
  conflictSet: keepFurtherPlant,
  // 목표 비중은 포트폴리오의 일부 — 저장한 목록으로 바꾼다 (빠진 것은 톰스톤). 남의 배분 id 와
  // 겹치면 건너뛴다.
  writeChildren: (tx, id, fields) =>
    replaceChildren(
      tx,
      schema.portfolioAllocation,
      { column: "portfolioId", id },
      "id",
      portfolioAllocationRows(id, fields)
    ),
  // 이 포트폴리오의 연결 계좌만 맞춘다 (다른 포트폴리오의 연결은 v2 기기가 바꿨을 수 있다). 지우면
  // 이 포트폴리오를 가리키던 계좌의 연결을 끊는다.
  afterChange: (tx, userId, id, fields) =>
    linkPortfolioAccounts(tx, userId, id, fields?.accountIds ?? []),
  toData: async (db, rows) => {
    const ids = rows.map((r) => r.id);
    const [portfolios, allocations] = await Promise.all([
      selectRowsByIds<PortfolioRow>(db, schema.portfolio, ids),
      db
        .select()
        .from(schema.portfolioAllocation)
        .where(
          and(
            inArray(schema.portfolioAllocation.portfolioId, ids),
            isNull(schema.portfolioAllocation.deletedAt)
          )
        ),
    ]);
    return new Map(
      portfolios.map((p) => [
        p.id,
        portfolioRowToData(
          p,
          allocations.filter((a) => a.portfolioId === p.id)
        ),
      ])
    );
  },
});

/**
 * 동기화 저장. 서버가 더 자란 식물을 지켰으면 version 을 돌려주지 않는다 — 클라이언트는 받은
 * version 을 "이미 본 변경" 으로 치므로, 돌려주면 다음 pull 이 서버의 식물을 건너뛴다.
 */
async function upsertPortfolio(
  db: Database,
  userId: string,
  id: string,
  fields: PortfolioFields
): Promise<MutationResult> {
  const result = await portfolioRepo.upsert(db, userId, id, fields);
  if (result.status !== "ok" || !fields.plant) return result;
  const [row] = await db
    .select({ growthStage: p.growthStage })
    .from(p)
    .where(and(eq(p.id, id), eq(p.userId, userId)));
  return row && row.growthStage > fields.plant.growthStage ? { status: "ok" } : result;
}

export const portfolioSyncEntity: SyncEntity = {
  entity: "portfolio",
  parseFields: parsePortfolioFields,
  upsert: upsertPortfolio as SyncEntity["upsert"],
  remove: portfolioRepo.remove,
  changes: portfolioRepo.changes,
};
