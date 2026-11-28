import { sql } from "drizzle-orm";
import type { Database } from "./client";
import * as schema from "./schema";
import { reserveChangeSeqs } from "./sync-state";

/**
 * 동기화 v2 expand (v2-2) backfill. 마이그레이션 0024 가 더한 열·테이블을 지금 데이터로 채운다.
 *
 * 1. 하위 레코드 `sortKey`: 지금 읽히는 순서(ctid). 하위 행을 UPDATE 하면 ctid 가 바뀌므로 맨 먼저 한다
 * 2. 하위 레코드의 `userId` (부모에서)
 * 3. 부모가 톰스톤인 하위 레코드에 톰스톤 (설계 §2.3 "부모를 지우면 하위도")
 * 4. `investment_record.id` = uuidv5(accountId, date)
 * 5. 루트 `sortKey`: 없는 것은 만든 순으로 뒤에 (옛 `user_list_order` 는 v2-5b 에서 지웠다)
 * 6. `changeSeq`: 번호가 없는(0) 행에 사용자별로 updatedAt 순 (하위는 부모의 updatedAt)
 *
 * 멱등이다 — 채워진 값은 건드리지 않고, 다시 돌리면 그 사이 v1 쓰기가 만든 빈 칸만 채운다
 * (v1 은 하위 행을 지우고 다시 넣으므로 새 열이 기본값으로 돌아간다). v2 로 쓴 행은 그대로 둔다.
 * 사용자마다 한 트랜잭션. 옛 `rebalancing.tasks` jsonb 를 할 일 행으로 펼치던 단계는 jsonb 컬럼과
 * 함께 v2-5b 에서 지웠다 (운영은 v2-2 배포 때 펼쳤다).
 * 루트 테이블의 `updatedAt` 은 바꾸지 않는다 — v1 pull 커서라 바꾸면 모든 기기가 전부 다시 받는다.
 */

/** 정의(`@seedbook/domain`)에서 오는 키 함수. database src 는 import 없는 domain 모듈만 쓴다 (`packages/domain/src/database-imports.test.ts`) — 레코드 정의는 여러 파일이라 스크립트가 넘긴다. */
export interface SyncV2Keys {
  /** uuidv5(accountId, "YYYY-MM-DD"). */
  accountRecordId(accountId: string, date: string): string;
  /** `last` 뒤에 붙일 분수 인덱스 키 `count` 개. */
  sortKeysAfter(last: string | null, count: number): string[];
}

export interface SyncV2BackfillSummary {
  childUserIds: number;
  childTombstones: number;
  accountRecordIds: number;
  sortKeys: number;
  changeSeqs: number;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const emptySummary = (): SyncV2BackfillSummary => ({
  childUserIds: 0,
  childTombstones: 0,
  accountRecordIds: 0,
  sortKeys: 0,
  changeSeqs: 0,
});

/** 하위 레코드 테이블 → 부모. `sorted` 면 `sortKey` 가 있다. */
const CHILD_TABLES = [
  { table: "stock_holding", parentTable: "investment_account", column: "accountId", sorted: true },
  { table: "cash_item", parentTable: "investment_account", column: "accountId", sorted: true },
  {
    table: "investment_record",
    parentTable: "investment_account",
    column: "accountId",
    sorted: false,
  },
  { table: "portfolio_allocation", parentTable: "portfolio", column: "portfolioId", sorted: true },
  { table: "rebalancing_task", parentTable: "rebalancing", column: "rebalancingId", sorted: true },
] as const;

/** 목록 순서(`sortKey`)를 가진 루트 테이블. */
const ROOT_TABLES = ["investment_account", "portfolio", "rebalancing"] as const;

/**
 * changeSeq 를 매길 테이블 (레코드 정의 순서 — 같은 시각이면 부모가 먼저). `parent` 가 있으면 부모의
 * updatedAt 으로 정렬한다. 설정은 id 대신 userId 가 키다.
 */
const SEQ_TABLES = [
  { table: "investment_account", key: "id", parent: null },
  { table: "stock_holding", key: "id", parent: CHILD_TABLES[0] },
  { table: "cash_item", key: "id", parent: CHILD_TABLES[1] },
  { table: "investment_record", key: "id", parent: CHILD_TABLES[2] },
  { table: "portfolio", key: "id", parent: null },
  { table: "portfolio_allocation", key: "id", parent: CHILD_TABLES[3] },
  { table: "rebalancing", key: "id", parent: null },
  { table: "rebalancing_task", key: "id", parent: CHILD_TABLES[4] },
  { table: "user_preference", key: "userId", parent: null },
] as const;

const ident = (name: string) => sql.raw(`"${name}"`);
const table = (name: string) => sql.raw(`"seedbook"."${name}"`);

async function rows<T>(tx: Tx, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await tx.execute(query)) as unknown as T[];
}

/** 모든 사용자를 backfill 한다. 사용자마다 한 트랜잭션. */
export async function backfillSyncV2(
  db: Database,
  keys: SyncV2Keys
): Promise<SyncV2BackfillSummary & { users: number }> {
  const users = await db.select({ id: schema.user.id }).from(schema.user).orderBy(schema.user.id);
  const total = { ...emptySummary(), users: users.length };
  for (const { id } of users) {
    const summary = await db.transaction((tx) => backfillUserSyncV2(tx, id, keys));
    for (const k of Object.keys(summary) as Array<keyof SyncV2BackfillSummary>) {
      total[k] += summary[k];
    }
  }
  return total;
}

export async function backfillUserSyncV2(
  tx: Tx,
  userId: string,
  keys: SyncV2Keys
): Promise<SyncV2BackfillSummary> {
  const summary = emptySummary();
  summary.sortKeys = await fillChildSortKeys(tx, userId, keys);
  summary.childUserIds = await fillChildUserIds(tx, userId);
  summary.childTombstones = await tombstoneOrphanedChildren(tx, userId);
  summary.accountRecordIds = await fillAccountRecordIds(tx, userId, keys);
  summary.sortKeys += await fillRootSortKeys(tx, userId, keys);
  summary.changeSeqs = await fillChangeSeqs(tx, userId);
  return summary;
}

async function fillChildUserIds(tx: Tx, userId: string): Promise<number> {
  let count = 0;
  for (const child of CHILD_TABLES) {
    const updated = await rows(
      tx,
      sql`
        UPDATE ${table(child.table)} AS c SET "userId" = p."userId"
        FROM ${table(child.parentTable)} AS p
        WHERE c.${ident(child.column)} = p."id" AND p."userId" = ${userId} AND c."userId" IS NULL
        RETURNING 1
      `
    );
    count += updated.length;
  }
  return count;
}

/** 톰스톤 부모의 살아 있는 하위 레코드에 부모의 삭제 시각으로 톰스톤을 찍는다 (번호는 다시 받음). */
async function tombstoneOrphanedChildren(tx: Tx, userId: string): Promise<number> {
  let count = 0;
  for (const child of CHILD_TABLES) {
    const updated = await rows(
      tx,
      sql`
        UPDATE ${table(child.table)} AS c
        SET "deletedAt" = p."deletedAt", "version" = c."version" + 1, "changeSeq" = 0
        FROM ${table(child.parentTable)} AS p
        WHERE c.${ident(child.column)} = p."id" AND c."userId" = ${userId}
          AND p."deletedAt" IS NOT NULL AND c."deletedAt" IS NULL
        RETURNING 1
      `
    );
    count += updated.length;
  }
  return count;
}

async function fillAccountRecordIds(tx: Tx, userId: string, keys: SyncV2Keys): Promise<number> {
  const missing = await rows<{ accountId: string; date: string }>(
    tx,
    sql`
      SELECT "accountId", "date"::text AS "date" FROM "seedbook"."investment_record"
      WHERE "userId" = ${userId} AND "id" IS NULL
    `
  );
  for (const r of missing) {
    await tx.execute(sql`
      UPDATE "seedbook"."investment_record" SET "id" = ${keys.accountRecordId(r.accountId, r.date)}
      WHERE "accountId" = ${r.accountId} AND "date" = ${r.date}::date
    `);
  }
  return missing.length;
}

const maxKey = (values: Array<string | null>): string | null =>
  values.reduce<string | null>(
    (max, v) => (v !== null && (max === null || v > max) ? v : max),
    null
  );

// ─── sortKey ────────────────────────────────────────────────────────────────

async function setSortKeys(tx: Tx, tableName: string, ids: string[], keys: string[]) {
  for (const [i, id] of ids.entries()) {
    await tx.execute(sql`UPDATE ${table(tableName)} SET "sortKey" = ${keys[i]} WHERE "id" = ${id}`);
  }
}

/** 루트: 키 없는 행을 만든 순으로 기존 키 뒤에 붙인다. */
async function fillRootSortKeys(tx: Tx, userId: string, keys: SyncV2Keys): Promise<number> {
  let count = 0;
  for (const rootTable of ROOT_TABLES) {
    const items = await rows<{ id: string; sortKey: string | null; createdAt: Date }>(
      tx,
      sql`SELECT "id", "sortKey", "createdAt" FROM ${table(rootTable)} WHERE "userId" = ${userId}`
    );
    const missing = items.filter((r) => r.sortKey === null);
    if (missing.length === 0) continue;
    missing.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
    const ids = missing.map((r) => r.id);
    await setSortKeys(
      tx,
      rootTable,
      ids,
      keys.sortKeysAfter(maxKey(items.map((r) => r.sortKey)), ids.length)
    );
    count += ids.length;
  }
  return count;
}

/**
 * 하위: 부모마다 키 없는 행을 지금 읽히는 순서(ctid — v1 이 넣은 순서)로 기존 키 뒤에 붙인다.
 * v1 은 하위 행을 통째로 지우고 다시 넣으므로 한 부모의 행은 모두 키가 있거나 모두 없다.
 */
async function fillChildSortKeys(tx: Tx, userId: string, keys: SyncV2Keys): Promise<number> {
  let count = 0;
  for (const child of CHILD_TABLES) {
    if (!child.sorted) continue;
    // 하위 행의 userId 는 아직 비어 있을 수 있어 부모로 사용자를 고른다.
    const items = await rows<{ id: string; parentId: string; sortKey: string | null }>(
      tx,
      sql`
        SELECT c."id", c.${ident(child.column)} AS "parentId", c."sortKey"
        FROM ${table(child.table)} AS c JOIN ${table(child.parentTable)} AS p
          ON p."id" = c.${ident(child.column)}
        WHERE p."userId" = ${userId} ORDER BY c.${ident(child.column)}, c.ctid
      `
    );
    const byParent = new Map<string, typeof items>();
    for (const item of items) {
      byParent.set(item.parentId, [...(byParent.get(item.parentId) ?? []), item]);
    }
    for (const group of byParent.values()) {
      const ids = group.filter((r) => r.sortKey === null).map((r) => r.id);
      if (ids.length === 0) continue;
      await setSortKeys(
        tx,
        child.table,
        ids,
        keys.sortKeysAfter(maxKey(group.map((r) => r.sortKey)), ids.length)
      );
      count += ids.length;
    }
  }
  return count;
}

// ─── changeSeq ──────────────────────────────────────────────────────────────

interface Unnumbered {
  table: string;
  key: string;
  id: string;
  ts: number;
  order: number;
  sortKey: string;
}

/** 번호가 없는(0) 행에 updatedAt 순으로 사용자의 변경 번호를 매긴다. */
async function fillChangeSeqs(tx: Tx, userId: string): Promise<number> {
  const pending: Unnumbered[] = [];
  for (const [order, t] of SEQ_TABLES.entries()) {
    const sortKey =
      t.table === "investment_record" || t.table === "user_preference" ? sql`''` : sql`c."sortKey"`;
    const query = t.parent
      ? sql`
          SELECT c."id"::text AS "id", p."updatedAt" AS "ts", ${sortKey} AS "sortKey"
          FROM ${table(t.table)} AS c JOIN ${table(t.parent.parentTable)} AS p
            ON p."id" = c.${ident(t.parent.column)}
          WHERE c."userId" = ${userId} AND c."changeSeq" = 0
        `
      : sql`
          SELECT c.${ident(t.key)}::text AS "id", c."updatedAt" AS "ts", ${sortKey} AS "sortKey"
          FROM ${table(t.table)} AS c
          WHERE c."userId" = ${userId} AND c."changeSeq" = 0
        `;
    for (const r of await rows<{ id: string; ts: Date; sortKey: string | null }>(tx, query)) {
      pending.push({
        table: t.table,
        key: t.key,
        id: r.id,
        ts: new Date(r.ts).getTime(),
        order,
        sortKey: r.sortKey ?? "",
      });
    }
  }
  if (pending.length === 0) return 0;

  pending.sort(
    (a, b) =>
      a.ts - b.ts ||
      a.order - b.order ||
      (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  const { first } = await reserveChangeSeqs(tx, userId, pending.length);
  for (const [i, r] of pending.entries()) {
    await tx.execute(sql`
      UPDATE ${table(r.table)} SET "changeSeq" = ${first + i}
      WHERE ${ident(r.key)}::text = ${r.id} AND "userId" = ${userId}
    `);
  }
  return pending.length;
}
