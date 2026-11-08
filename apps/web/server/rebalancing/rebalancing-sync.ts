import { schema, type Database } from "@seedbook/database";
import type { MutationResult, SyncedRebalancing } from "@web/server/sync/types";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  rebalancingPayloadToColumns,
  rebalancingRowToPayload,
  type RebalancingPayload,
} from "./rebalancing-record";

type RebalancingRow = typeof schema.rebalancing.$inferSelect;

export function toSyncedRebalancing(row: RebalancingRow): SyncedRebalancing {
  if (row.deletedAt) {
    return { id: row.id, version: row.version, deletedAt: row.deletedAt.toISOString(), data: null };
  }
  const data: Omit<RebalancingPayload, "id"> & { id?: string } = rebalancingRowToPayload(row);
  delete data.id;
  return { id: row.id, version: row.version, deletedAt: null, data };
}

/**
 * 리밸런싱 저장 (생성/수정). 마지막 저장이 이긴다 — 본인 행이면 version 과 상관없이
 * 덮어쓰고, 톰스톤이면 되살린다. 다른 사용자 소유의 id 면 거부한다.
 */
export async function upsertRebalancing(
  db: Database,
  userId: string,
  id: string,
  fields: Omit<RebalancingPayload, "id">
): Promise<MutationResult> {
  const columns = rebalancingPayloadToColumns(fields);
  const now = new Date();
  const [row] = await db
    .insert(schema.rebalancing)
    .values({ id, userId, ...columns, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.rebalancing.id,
      // 남의 행이면 갱신하지 않는다 → 아무 행도 돌아오지 않는다.
      where: eq(schema.rebalancing.userId, userId),
      set: {
        ...columns,
        deletedAt: null,
        updatedAt: now,
        version: sql`${schema.rebalancing.version} + 1`,
      },
    })
    .returning({ version: schema.rebalancing.version });
  if (row) return { status: "ok", version: row.version };
  return { status: "rejected", reason: "forbidden" };
}

/**
 * 리밸런싱 삭제 → 톰스톤. 이미 지워졌거나 없는 행은 성공으로 본다 (재전송에 안전).
 */
export async function deleteRebalancing(
  db: Database,
  userId: string,
  id: string
): Promise<MutationResult> {
  const now = new Date();
  const [row] = await db
    .update(schema.rebalancing)
    .set({ deletedAt: now, updatedAt: now, version: sql`${schema.rebalancing.version} + 1` })
    .where(
      and(
        eq(schema.rebalancing.id, id),
        eq(schema.rebalancing.userId, userId),
        isNull(schema.rebalancing.deletedAt)
      )
    )
    .returning({ version: schema.rebalancing.version });
  if (row) return { status: "ok", version: row.version };

  const current = await db.query.rebalancing.findFirst({ where: (t, { eq }) => eq(t.id, id) });
  if (!current) return { status: "ok" };
  if (current.userId !== userId) return { status: "rejected", reason: "forbidden" };
  return { status: "ok", version: current.version };
}

/**
 * `since` 이후 바뀐 리밸런싱 (톰스톤 포함). `since` 가 없으면 첫 동기화라 살아 있는 것만.
 */
export async function rebalancingChanges(
  db: Database,
  userId: string,
  since: Date | null
): Promise<{ rows: SyncedRebalancing[]; latest: Date | null }> {
  const rows = await db
    .select()
    .from(schema.rebalancing)
    .where(
      and(
        eq(schema.rebalancing.userId, userId),
        since ? gt(schema.rebalancing.updatedAt, since) : isNull(schema.rebalancing.deletedAt)
      )
    );
  const latest = rows.reduce<Date | null>(
    (max, r) => (max === null || r.updatedAt > max ? r.updatedAt : max),
    null
  );
  return { rows: rows.map(toSyncedRebalancing), latest };
}
