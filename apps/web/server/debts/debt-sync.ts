import { schema, type Database } from "@seedbook/database";
import type { MutationResult, SyncedDebt } from "@web/server/sync/types";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { debtPayloadToColumns, debtRowToPayload, type DebtPayload } from "./debt-record";

type DebtRow = typeof schema.debt.$inferSelect;

export function toSyncedDebt(row: DebtRow): SyncedDebt {
  if (row.deletedAt) {
    return { id: row.id, version: row.version, deletedAt: row.deletedAt.toISOString(), data: null };
  }
  const { id: _id, ...data } = debtRowToPayload(row);
  return { id: row.id, version: row.version, deletedAt: null, data };
}

/**
 * 부채 저장 (생성/수정). 마지막 저장이 이긴다 — 본인 행이면 version 과 상관없이 덮어쓰고,
 * 톰스톤이면 되살린다. 다른 사용자 소유의 id 면 거부한다.
 */
export async function upsertDebt(
  db: Database,
  userId: string,
  id: string,
  fields: Omit<DebtPayload, "id">
): Promise<MutationResult> {
  const columns = debtPayloadToColumns(fields);
  const now = new Date();
  const [row] = await db
    .insert(schema.debt)
    .values({ id, userId, ...columns, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.debt.id,
      // 남의 행이면 갱신하지 않는다 → 아무 행도 돌아오지 않는다.
      where: eq(schema.debt.userId, userId),
      set: {
        ...columns,
        deletedAt: null,
        updatedAt: now,
        version: sql`${schema.debt.version} + 1`,
      },
    })
    .returning({ version: schema.debt.version });
  if (row) return { status: "ok", version: row.version };
  return { status: "rejected", reason: "forbidden" };
}

/**
 * 부채 삭제 → 톰스톤. 이미 지워졌거나 없는 부채는 성공으로 본다 (재전송에 안전).
 */
export async function deleteDebt(
  db: Database,
  userId: string,
  id: string
): Promise<MutationResult> {
  const now = new Date();
  const [row] = await db
    .update(schema.debt)
    .set({ deletedAt: now, updatedAt: now, version: sql`${schema.debt.version} + 1` })
    .where(
      and(eq(schema.debt.id, id), eq(schema.debt.userId, userId), isNull(schema.debt.deletedAt))
    )
    .returning({ version: schema.debt.version });
  if (row) return { status: "ok", version: row.version };

  const current = await db.query.debt.findFirst({ where: (t, { eq }) => eq(t.id, id) });
  if (!current) return { status: "ok" };
  if (current.userId !== userId) return { status: "rejected", reason: "forbidden" };
  return { status: "ok", version: current.version };
}

/**
 * `since` 이후 바뀐 부채 (톰스톤 포함). `since` 가 없으면 첫 동기화라 살아 있는 것만.
 */
export async function debtChanges(
  db: Database,
  userId: string,
  since: Date | null
): Promise<{ rows: SyncedDebt[]; latest: Date | null }> {
  const rows = await db
    .select()
    .from(schema.debt)
    .where(
      and(
        eq(schema.debt.userId, userId),
        since ? gt(schema.debt.updatedAt, since) : isNull(schema.debt.deletedAt)
      )
    );
  const latest = rows.reduce<Date | null>(
    (max, r) => (max === null || r.updatedAt > max ? r.updatedAt : max),
    null
  );
  return { rows: rows.map(toSyncedDebt), latest };
}
