import type { Database, schema } from "@seedbook/database";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { MutationResult, SyncedEntity } from "./types";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * 엔티티 동기화 대상 최상위 테이블 — `id` / `userId` / `version` / `deletedAt` / `updatedAt`
 * 컬럼을 가진다 (`schema.ts` 의 `syncColumns()`). 테이블마다 drizzle 타입이 달라 공통 컬럼만
 * 쓰도록 하나로 좁혀 다룬다.
 */
export type SyncRootTable = typeof schema.debt;

type RootRow = {
  id: string;
  userId: string;
  version: number;
  deletedAt: Date | null;
  updatedAt: Date;
};

export type EntityRepoOptions<Fields, Data> = {
  table: unknown;
  /** 입력 필드 → 최상위 행 컬럼 (id / userId / 동기화 컬럼 제외). */
  toColumns: (fields: Fields) => Record<string, unknown>;
  /** 최상위 행을 쓴 뒤 하위 테이블(기록·보유종목 등)을 같은 트랜잭션에서 다시 쓴다. */
  writeChildren?: (tx: Tx, id: string, fields: Fields) => Promise<void>;
  /** 저장·삭제 뒤 같은 트랜잭션에서 맞출 파생 데이터 (예: 계좌 ↔ 포트폴리오 연결). */
  afterChange?: (tx: Tx, userId: string) => Promise<void>;
  /** 살아 있는 행들 → 클라이언트에 줄 데이터 (하위 테이블 포함). */
  toData: (db: Database, rows: RootRow[]) => Promise<Map<string, Data>>;
};

export type EntityRepo<Fields, Data> = {
  upsert: (db: Database, userId: string, id: string, fields: Fields) => Promise<MutationResult>;
  remove: (db: Database, userId: string, id: string) => Promise<MutationResult>;
  changes: (
    db: Database,
    userId: string,
    since: Date | null
  ) => Promise<{ rows: SyncedEntity<Data>[]; latest: Date | null }>;
};

/**
 * 엔티티 하나의 저장 / 삭제 / 변경 조회. 규칙은 모든 도메인이 같다:
 *   - 저장: 마지막 저장이 이긴다. 본인 행이면 version 과 상관없이 덮어쓰고 톰스톤이면
 *     되살린다. 다른 사용자 소유의 id 면 거부 (하위 테이블도 건드리지 않는다).
 *   - 삭제: 톰스톤 (`deletedAt`). 이미 지워졌거나 없는 행은 성공 (재전송에 안전).
 *   - 변경 조회: `since` 이후 바뀐 행 (톰스톤 포함). `since` 가 없으면 살아 있는 행만.
 */
export function createEntityRepo<Fields, Data>(
  options: EntityRepoOptions<Fields, Data>
): EntityRepo<Fields, Data> {
  const t = options.table as SyncRootTable;

  async function upsert(db: Database, userId: string, id: string, fields: Fields) {
    const columns = options.toColumns(fields);
    const now = new Date();
    return db.transaction(async (tx): Promise<MutationResult> => {
      const [row] = await tx
        .insert(t)
        .values({ id, userId, ...columns, updatedAt: now } as typeof t.$inferInsert)
        .onConflictDoUpdate({
          target: t.id,
          // 남의 행이면 갱신하지 않는다 → 아무 행도 돌아오지 않는다.
          where: eq(t.userId, userId),
          set: { ...columns, deletedAt: null, updatedAt: now, version: sql`${t.version} + 1` },
        })
        .returning({ version: t.version });
      if (!row) return { status: "rejected", reason: "forbidden" };
      if (options.writeChildren) await options.writeChildren(tx, id, fields);
      if (options.afterChange) await options.afterChange(tx, userId);
      return { status: "ok", version: row.version };
    });
  }

  async function remove(db: Database, userId: string, id: string): Promise<MutationResult> {
    const now = new Date();
    const [row] = await db.transaction(async (tx) => {
      const deleted = await tx
        .update(t)
        .set({ deletedAt: now, updatedAt: now, version: sql`${t.version} + 1` })
        .where(and(eq(t.id, id), eq(t.userId, userId), isNull(t.deletedAt)))
        .returning({ version: t.version });
      if (deleted.length > 0 && options.afterChange) await options.afterChange(tx, userId);
      return deleted;
    });
    if (row) return { status: "ok", version: row.version };

    const [current] = await db
      .select({ userId: t.userId, version: t.version })
      .from(t)
      .where(eq(t.id, id));
    if (!current) return { status: "ok" };
    if (current.userId !== userId) return { status: "rejected", reason: "forbidden" };
    return { status: "ok", version: current.version };
  }

  async function changes(db: Database, userId: string, since: Date | null) {
    const rows = (await db
      .select({
        id: t.id,
        userId: t.userId,
        version: t.version,
        deletedAt: t.deletedAt,
        updatedAt: t.updatedAt,
      })
      .from(t)
      .where(
        and(eq(t.userId, userId), since ? gt(t.updatedAt, since) : isNull(t.deletedAt))
      )) as RootRow[];
    const live = rows.filter((r) => r.deletedAt === null);
    const data = live.length > 0 ? await options.toData(db, live) : new Map<string, Data>();
    const latest = rows.reduce<Date | null>(
      (max, r) => (max === null || r.updatedAt > max ? r.updatedAt : max),
      null
    );
    return {
      rows: rows.map(
        (r): SyncedEntity<Data> =>
          r.deletedAt
            ? { id: r.id, version: r.version, deletedAt: r.deletedAt.toISOString(), data: null }
            : { id: r.id, version: r.version, deletedAt: null, data: data.get(r.id) ?? null }
      ),
      latest,
    };
  }

  return { upsert, remove, changes };
}

/** 살아 있는 최상위 행들을 id 로 다시 읽는다 (`toData` 구현에서 전체 컬럼이 필요할 때). */
export async function selectRowsByIds<Row>(db: Database, table: unknown, ids: string[]) {
  const t = table as SyncRootTable;
  return (await db.select().from(t).where(inArray(t.id, ids))) as unknown as Row[];
}
