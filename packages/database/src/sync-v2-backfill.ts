import { and, eq, sql } from "drizzle-orm";
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
 * 5. `rebalancing.tasks` jsonb → `rebalancing_task` (없는 것은 jsonb 순서대로 넣고, 달라진 것은
 *    고치고, jsonb 에서 빠진 것은 톰스톤)
 * 6. 루트 `sortKey`: `user_list_order` 순서 → 없는 것은 만든 순
 * 7. `changeSeq`: 번호가 없는(0) 행에 사용자별로 updatedAt 순 (하위는 부모의 updatedAt)
 *
 * 멱등이다 — 채워진 값은 건드리지 않고, 다시 돌리면 그 사이 v1 쓰기가 만든 빈 칸만 채운다
 * (v1 은 하위 행을 지우고 다시 넣으므로 새 열이 기본값으로 돌아간다). v2 로 쓴 행은 그대로 둔다 —
 * 할 일은 v1 이 세션을 마지막으로 쓴 경우에만 jsonb 를 따른다 (`tasksJsonIsNewer`). 사용자마다 한 트랜잭션.
 * 루트 테이블의 `updatedAt` 은 바꾸지 않는다 — v1 pull 커서라 바꾸면 모든 기기가 전부 다시 받는다.
 */

/** 정의(`@seedbook/domain`)에서 오는 키 함수. database src 는 import 없는 domain 모듈만 쓴다 (`packages/domain/src/database-imports.test.ts`) — 레코드 정의는 여러 파일이라 스크립트가 넘긴다. */
export interface SyncV2Keys {
  /** uuidv5(accountId, "YYYY-MM-DD"). */
  accountRecordId(accountId: string, date: string): string;
  /** uuidv5(rebalancingId, allocationId). */
  rebalancingTaskId(rebalancingId: string, allocationId: string): string;
  /** `last` 뒤에 붙일 분수 인덱스 키 `count` 개. */
  sortKeysAfter(last: string | null, count: number): string[];
}

export interface SyncV2BackfillSummary {
  childUserIds: number;
  childTombstones: number;
  accountRecordIds: number;
  tasksInserted: number;
  tasksUpdated: number;
  tasksTombstoned: number;
  /** jsonb 에 있지만 모양이 잘못돼 펼치지 못한 할 일 (같은 allocationId 가 또 나온 것 포함). */
  tasksSkipped: number;
  sortKeys: number;
  changeSeqs: number;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const emptySummary = (): SyncV2BackfillSummary => ({
  childUserIds: 0,
  childTombstones: 0,
  accountRecordIds: 0,
  tasksInserted: 0,
  tasksUpdated: 0,
  tasksTombstoned: 0,
  tasksSkipped: 0,
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

/** 루트 테이블 → 지금 순서를 가진 `user_list_order.domain`. */
const ROOT_TABLES = [
  { table: "investment_account", listOrderDomain: "investment-accounts" },
  { table: "portfolio", listOrderDomain: "portfolios" },
  { table: "rebalancing", listOrderDomain: "rebalancings" },
] as const;

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
  Object.assign(summary, await expandRebalancingTasks(tx, userId, keys));
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

// ─── rebalancing.tasks → rebalancing_task ──────────────────────────────────

type TaskColumns = Omit<
  typeof schema.rebalancingTask.$inferInsert,
  | "id"
  | "userId"
  | "rebalancingId"
  | "version"
  | "deletedAt"
  | "changeSeq"
  | "sortKey"
  | "createdAt"
  | "updatedAt"
>;

const TASK_FIELDS = [
  "allocationId",
  "market",
  "ticker",
  "name",
  "action",
  "amount",
  "price",
  "quantity",
  "priceAsOf",
  "priceKind",
  "executedQuantity",
  "executedPrice",
  "orderedQuantity",
  "orderedPrice",
  "filledQuantity",
  "filledAmount",
  "done",
] as const satisfies ReadonlyArray<keyof TaskColumns>;

const isText = (x: unknown): x is string => typeof x === "string";
const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const optionalNumber = (x: unknown): number | null | undefined =>
  x === undefined || x === null ? null : isNumber(x) ? x : undefined;

/**
 * jsonb 의 할 일 하나 → 컬럼 값. 저장 때 v1 검증(`parseRebalancingFields`)을 거친 값이지만, 모양이
 * 다르면 null (건너뛰고 센다). 나중에 추가된 필드는 없으면 null — v1 읽기와 같다.
 */
export function taskToColumns(value: unknown): TaskColumns | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    !isText(v.id) ||
    !isText(v.market) ||
    !isText(v.ticker) ||
    !isText(v.name) ||
    (v.action !== "매수" && v.action !== "매도") ||
    !isNumber(v.amount) ||
    typeof v.done !== "boolean"
  ) {
    return null;
  }
  const price = optionalNumber(v.price);
  const quantity = optionalNumber(v.quantity);
  const numbers = {
    executedQuantity: optionalNumber(v.executedQuantity),
    executedPrice: optionalNumber(v.executedPrice),
    orderedQuantity: optionalNumber(v.orderedQuantity),
    orderedPrice: optionalNumber(v.orderedPrice),
    filledQuantity: optionalNumber(v.filledQuantity),
    filledAmount: optionalNumber(v.filledAmount),
  };
  if (price === undefined || quantity === undefined) return null;
  if (Object.values(numbers).some((n) => n === undefined)) return null;
  const priceAsOf = v.priceAsOf ?? null;
  if (priceAsOf !== null && (!isText(priceAsOf) || Number.isNaN(Date.parse(priceAsOf)))) {
    return null;
  }
  const priceKind = v.priceKind ?? null;
  if (priceKind !== null && priceKind !== "realtime" && priceKind !== "close") return null;
  return {
    allocationId: v.id,
    market: v.market,
    ticker: v.ticker,
    name: v.name,
    action: v.action,
    amount: v.amount,
    price,
    quantity,
    priceAsOf: priceAsOf === null ? null : new Date(priceAsOf),
    priceKind,
    ...(numbers as Record<keyof typeof numbers, number | null>),
    done: v.done,
  };
}

const comparable = (value: unknown) => (value instanceof Date ? value.getTime() : (value ?? null));

function sameTask(a: TaskColumns, b: TaskColumns): boolean {
  return TASK_FIELDS.every((f) => comparable(a[f]) === comparable(b[f]));
}

const maxKey = (values: Array<string | null>): string | null =>
  values.reduce<string | null>(
    (max, v) => (v !== null && (max === null || v > max) ? v : max),
    null
  );

/**
 * 이미 펼친 세션의 `tasks` jsonb 가 할 일 행보다 새것인지 — v1 이 세션을 마지막으로 썼을 때만이다.
 * v2 는 jsonb 를 쓰지 않으므로 (v2 로 만든 세션은 `[]`) jsonb 를 따르면 v2 로 쓴 할 일을 되돌리거나
 * 지운다. v1 저장은 세션의 `updatedAt` 만 올리고 `changeSeq` 는 그대로 두지만, v2 의 세션 쓰기는
 * 새 번호를 받아 할 일들의 번호보다 커진다. 그래서:
 * - 세션이 모든 할 일 행보다 나중에 쓰였고 (할 일을 v2 로 고친 뒤 v1 이 다시 쓰지 않았으면 아니다)
 * - 세션의 번호가 할 일 번호보다 작다 (그 마지막 쓰기가 v2 였으면 아니다)
 */
function tasksJsonIsNewer(
  session: { updatedAt: Date; changeSeq: number },
  tasks: Array<{ updatedAt: Date; changeSeq: number }>
): boolean {
  const lastTaskWrite = Math.max(...tasks.map((r) => r.updatedAt.getTime()));
  const lastTaskSeq = Math.max(...tasks.map((r) => r.changeSeq));
  return (
    session.updatedAt.getTime() > lastTaskWrite &&
    (session.changeSeq === 0 || session.changeSeq < lastTaskSeq)
  );
}

async function expandRebalancingTasks(tx: Tx, userId: string, keys: SyncV2Keys) {
  const result = { tasksInserted: 0, tasksUpdated: 0, tasksTombstoned: 0, tasksSkipped: 0 };
  const t = schema.rebalancingTask;
  const sessions = await tx
    .select({
      id: schema.rebalancing.id,
      tasks: schema.rebalancing.tasks,
      deletedAt: schema.rebalancing.deletedAt,
      updatedAt: schema.rebalancing.updatedAt,
      changeSeq: schema.rebalancing.changeSeq,
    })
    .from(schema.rebalancing)
    .where(eq(schema.rebalancing.userId, userId))
    .orderBy(schema.rebalancing.id);
  const existing = await tx.select().from(t).where(eq(t.userId, userId));

  for (const session of sessions) {
    const current = existing.filter((r) => r.rebalancingId === session.id);
    if (current.length > 0 && !session.deletedAt && !tasksJsonIsNewer(session, current)) continue;
    const byId = new Map(current.map((r) => [r.id, r]));
    const expected = new Map<string, TaskColumns>();
    for (const raw of Array.isArray(session.tasks) ? session.tasks : []) {
      const columns = taskToColumns(raw);
      const id = columns && keys.rebalancingTaskId(session.id, columns.allocationId);
      if (!columns || !id || expected.has(id)) {
        result.tasksSkipped += 1;
        continue;
      }
      expected.set(id, columns);
    }

    // 새 할 일: 처음이면 jsonb 순서대로, 이미 펼친 세션이면 그 뒤에 붙인다.
    const added = [...expected].filter(([id]) => !byId.has(id));
    const sortKeys = keys.sortKeysAfter(maxKey(current.map((r) => r.sortKey)), added.length);
    for (const [i, [id, columns]] of added.entries()) {
      await tx.insert(t).values({
        id,
        userId,
        rebalancingId: session.id,
        ...columns,
        sortKey: sortKeys[i] ?? null,
        deletedAt: session.deletedAt,
      });
      result.tasksInserted += 1;
    }

    for (const row of current) {
      // 삭제가 이긴다 — 톰스톤은 되살리지 않는다.
      if (row.deletedAt) continue;
      const columns = expected.get(row.id);
      if (columns && !session.deletedAt) {
        if (sameTask(row, columns)) continue;
        await tx
          .update(t)
          .set({ ...columns, version: sql`${t.version} + 1`, changeSeq: 0 })
          .where(and(eq(t.id, row.id), eq(t.userId, userId)));
        result.tasksUpdated += 1;
      } else {
        await tx
          .update(t)
          .set({
            deletedAt: session.deletedAt ?? new Date(),
            version: sql`${t.version} + 1`,
            changeSeq: 0,
          })
          .where(and(eq(t.id, row.id), eq(t.userId, userId)));
        result.tasksTombstoned += 1;
      }
    }
  }
  return result;
}

// ─── sortKey ────────────────────────────────────────────────────────────────

async function setSortKeys(tx: Tx, tableName: string, ids: string[], keys: string[]) {
  for (const [i, id] of ids.entries()) {
    await tx.execute(sql`UPDATE ${table(tableName)} SET "sortKey" = ${keys[i]} WHERE "id" = ${id}`);
  }
}

/** 루트: `user_list_order` 에 있는 순서 → 없는 것은 만든 순으로 뒤에 (클라이언트 `applyOrder` 와 같다). */
async function fillRootSortKeys(tx: Tx, userId: string, keys: SyncV2Keys): Promise<number> {
  let count = 0;
  for (const root of ROOT_TABLES) {
    const items = await rows<{ id: string; sortKey: string | null; createdAt: Date }>(
      tx,
      sql`SELECT "id", "sortKey", "createdAt" FROM ${table(root.table)} WHERE "userId" = ${userId}`
    );
    const missing = items.filter((r) => r.sortKey === null);
    if (missing.length === 0) continue;
    const [listOrder] = await tx
      .select({ order: schema.userListOrder.order })
      .from(schema.userListOrder)
      .where(
        and(
          eq(schema.userListOrder.userId, userId),
          eq(schema.userListOrder.domain, root.listOrderDomain)
        )
      );
    const rank = new Map((listOrder?.order ?? []).map((id, i) => [id, i]));
    missing.sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.POSITIVE_INFINITY) -
          (rank.get(b.id) ?? Number.POSITIVE_INFINITY) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
    const ids = missing.map((r) => r.id);
    await setSortKeys(
      tx,
      root.table,
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
