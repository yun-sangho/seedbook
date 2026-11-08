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
 * 조건부 쓰기가 0 행에 적용됐을 때 이유를 가린다: 남의 행이면 거부, 아니면 충돌로
 * 현재 상태를 돌려준다 (행이 없으면 `current: null`).
 */
async function diagnose(db: Database, userId: string, id: string): Promise<MutationResult> {
  const row = await db.query.debt.findFirst({ where: (t, { eq }) => eq(t.id, id) });
  if (row && row.userId !== userId) return { status: "rejected", reason: "forbidden" };
  return { status: "conflict", current: row ? toSyncedDebt(row) : null };
}

/**
 * 부채 생성/수정. `baseVersion` 0 은 새로 만들기, 그 외에는 서버 version 이 같을 때만
 * 갱신한다 (톰스톤도 그 version 이면 되살린다).
 */
export async function upsertDebt(
  db: Database,
  userId: string,
  id: string,
  baseVersion: number,
  fields: Omit<DebtPayload, "id">
): Promise<MutationResult> {
  const columns = debtPayloadToColumns(fields);
  const now = new Date();

  const written =
    baseVersion === 0
      ? await db
          .insert(schema.debt)
          .values({ id, userId, ...columns, updatedAt: now })
          .onConflictDoNothing()
          .returning({ version: schema.debt.version })
      : await db
          .update(schema.debt)
          .set({
            ...columns,
            deletedAt: null,
            updatedAt: now,
            version: sql`${schema.debt.version} + 1`,
          })
          .where(
            and(
              eq(schema.debt.id, id),
              eq(schema.debt.userId, userId),
              eq(schema.debt.version, baseVersion)
            )
          )
          .returning({ version: schema.debt.version });

  const [row] = written;
  if (row) return { status: "ok", version: row.version };
  return diagnose(db, userId, id);
}

/**
 * 부채 삭제 → 톰스톤. 이미 지워졌거나 없는 부채는 성공으로 본다 (재전송에 안전).
 */
export async function deleteDebt(
  db: Database,
  userId: string,
  id: string,
  baseVersion: number
): Promise<MutationResult> {
  const now = new Date();
  const [row] = await db
    .update(schema.debt)
    .set({ deletedAt: now, updatedAt: now, version: sql`${schema.debt.version} + 1` })
    .where(
      and(
        eq(schema.debt.id, id),
        eq(schema.debt.userId, userId),
        eq(schema.debt.version, baseVersion),
        isNull(schema.debt.deletedAt)
      )
    )
    .returning({ version: schema.debt.version });
  if (row) return { status: "ok", version: row.version };

  const current = await db.query.debt.findFirst({ where: (t, { eq }) => eq(t.id, id) });
  if (!current) return { status: "ok" };
  if (current.userId !== userId) return { status: "rejected", reason: "forbidden" };
  if (current.deletedAt) return { status: "ok", version: current.version };
  return { status: "conflict", current: toSyncedDebt(current) };
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
