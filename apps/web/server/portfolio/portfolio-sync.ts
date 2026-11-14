import { schema, syncAccountPortfolioLinks } from "@seedbook/database";
import { createEntityRepo, selectRowsByIds } from "@web/server/sync/entity-repo";
import type { SyncEntity } from "@web/server/sync/registry";
import { eq, inArray } from "drizzle-orm";
import {
  type PortfolioData,
  type PortfolioFields,
  parsePortfolioFields,
  portfolioAllocationRows,
  portfolioFieldsToColumns,
  portfolioRowToData,
} from "./portfolio-record";

type PortfolioRow = typeof schema.portfolio.$inferSelect;

export const portfolioRepo = createEntityRepo<PortfolioFields, PortfolioData>({
  table: schema.portfolio,
  toColumns: portfolioFieldsToColumns,
  // 목표 비중은 포트폴리오의 일부 — 저장할 때마다 통째로 바꾼다. 남의 배분 id 와 겹치면 건너뛴다.
  writeChildren: async (tx, id, fields) => {
    await tx
      .delete(schema.portfolioAllocation)
      .where(eq(schema.portfolioAllocation.portfolioId, id));
    const rows = portfolioAllocationRows(id, fields);
    if (rows.length > 0) {
      await tx.insert(schema.portfolioAllocation).values(rows).onConflictDoNothing();
    }
  },
  // 연결 계좌가 바뀌었거나 포트폴리오가 지워졌다 — 계좌 쪽 연결(portfolioId)을 맞춘다.
  afterChange: (tx, userId) => syncAccountPortfolioLinks(tx, userId),
  toData: async (db, rows) => {
    const ids = rows.map((r) => r.id);
    const [portfolios, allocations] = await Promise.all([
      selectRowsByIds<PortfolioRow>(db, schema.portfolio, ids),
      db
        .select()
        .from(schema.portfolioAllocation)
        .where(inArray(schema.portfolioAllocation.portfolioId, ids)),
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

export const portfolioSyncEntity: SyncEntity = {
  entity: "portfolio",
  parseFields: parsePortfolioFields,
  upsert: portfolioRepo.upsert as SyncEntity["upsert"],
  remove: portfolioRepo.remove,
  changes: portfolioRepo.changes,
};
