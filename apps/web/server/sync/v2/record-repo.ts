import { isDeepStrictEqual } from "node:util";
import { type Database, reserveChangeSeqs } from "@seedbook/database";
import {
  deriveRecordId,
  isValidSortKey,
  keyFields,
  type OpRejectCode,
  type PulledRecord,
  parsePatch,
  parseValue,
  type Rejection,
  type SyncOpKind,
  type SyncOpResult,
  sortKeysAfter,
  UUID_PATTERN,
} from "@seedbook/domain";
import { and, desc, eq, gt, isNotNull, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { fromColumnValue, RECORD_TABLES, type RecordTable, toColumnValue } from "./record-tables";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * 동기화 v2 공용 레코드 repo (설계 §4.2·§6). 레코드 9종을 정의 하나로 같은 규칙으로 다룬다.
 *
 * - 쓰기는 **보낸 필드만** 바꾼다 (패치). `default` 는 생성 때만 채운다.
 * - **삭제가 이긴다**: 톰스톤 레코드에 대한 생성·패치는 `deleted` 로 거부하고 되살리지 않는다.
 *   부모를 지우면 같은 트랜잭션에서 하위 레코드에 톰스톤을 찍고, 부모가 톰스톤이면 하위 레코드의
 *   생성·패치는 `parent_deleted` 로 거부한다.
 * - 바꾼 레코드마다 `reserveChangeSeqs` 로 번호 하나를 받는다. 값이 그대로인 쓰기(재전송)는 번호를
 *   쓰지 않는다 — 같은 push 를 두 번 보내도 결과가 같고 `changeSeq` 에 빈틈이 없다.
 *
 * 호출 쪽은 트랜잭션 맨 앞에서 `lockChangeSeqs` 로 사용자 행을 잠근다 (판단에 쓴 읽기까지 직렬화).
 */

type Row = Record<string, unknown>;

/** 결과와 함께 로그에 남길 것 (값은 담지 않는다). */
export interface AppliedOp {
  type: string | null;
  result: SyncOpResult;
}

const OP_KINDS: readonly SyncOpKind[] = ["create", "patch", "delete"];

const rejectOp = (code: OpRejectCode, rejected?: Rejection[]): SyncOpResult =>
  rejected?.length ? { status: "rejected", code, rejected } : { status: "rejected", code };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTable(rt: RecordTable): PgTable {
  return rt.table;
}

async function selectOne(tx: Tx, rt: RecordTable, where: SQL | undefined): Promise<Row | null> {
  const rows = (await tx
    .select(rt.selection)
    .from(asTable(rt) as never)
    .where(where)
    .limit(1)) as Row[];
  return rows[0] ?? null;
}

/**
 * 레코드 행. 키를 정하는 필드로 id 를 만드는 레코드(금액 기록)는 v1 경로가 id 없이 넣은 행이 있을
 * 수 있어, id 로 못 찾으면 (부모, 키 필드) 로도 찾는다 — id 가 그 둘에서 나오므로 같은 레코드다.
 */
async function findRow(
  tx: Tx,
  rt: RecordTable,
  id: string,
  derived?: { parentId: string; keyValue: unknown }
): Promise<Row | null> {
  const byId = await selectOne(tx, rt, eq(rt.key, id));
  if (byId || !derived || !rt.parent || rt.definition.key.kind !== "derived") return byId;
  const keyField = rt.fields.find((f) => f.name === (rt.definition.key as { name: string }).name);
  if (!keyField || !parseValue(keyField.spec, derived.keyValue).ok) return null;
  return selectOne(
    tx,
    rt,
    and(
      eq(rt.parent, derived.parentId),
      eq(keyField.column, toColumnValue(keyField, derived.keyValue))
    )
  );
}

function omitKeyFields(rt: RecordTable, fields: Record<string, unknown>) {
  const rest = { ...fields };
  for (const name of keyFields(rt.definition)) delete rest[name];
  return rest;
}

function parentTable(rt: RecordTable): RecordTable | null {
  const type = rt.definition.parent?.type;
  return type ? (RECORD_TABLES.get(type) ?? null) : null;
}

/** 하위 레코드의 부모 행. */
async function findParent(tx: Tx, rt: RecordTable, parentId: unknown): Promise<Row | null> {
  const parent = parentTable(rt);
  if (!parent || typeof parentId !== "string") return null;
  return selectOne(tx, parent, eq(parent.key, parentId));
}

/** 행의 주인. v1 경로가 넣은 하위 행은 `userId` 가 비어 있어 부모의 주인을 본다. */
function ownerOf(row: Row, parentRow: Row | null): unknown {
  return row.userId ?? parentRow?.userId ?? null;
}

async function nextSeq(tx: Tx, userId: string): Promise<number> {
  return (await reserveChangeSeqs(tx, userId, 1)).first;
}

/** 형제 레코드의 마지막 `sortKey` 뒤 키. 바이트 순으로 비교한다 (`COLLATE "C"`). */
async function sortKeyAtEnd(
  tx: Tx,
  rt: RecordTable,
  userId: string,
  parentId: string | null
): Promise<string> {
  const sortKey = rt.sortKey;
  if (!sortKey) throw new Error(`${rt.definition.type}: 정렬하지 않는 레코드`);
  const scope = rt.parent && parentId ? eq(rt.parent, parentId) : eq(rt.userId, userId);
  const rows = (await tx
    .select({ sortKey })
    .from(asTable(rt) as never)
    .where(and(scope, isNotNull(sortKey)))
    .orderBy(desc(sql`${sortKey} COLLATE "C"`))
    .limit(1)) as Array<{ sortKey: string | null }>;
  const last = rows[0]?.sortKey ?? null;
  return sortKeysAfter(isValidSortKey(last) ? last : null, 1)[0] as string;
}

/** 패치 값 → 바뀐 컬럼만. 같은 값이면 쓰지 않는다. */
function changedColumns(rt: RecordTable, patch: Record<string, unknown>, row: Row) {
  const changed: Record<string, unknown> = {};
  for (const field of rt.fields) {
    if (!(field.name in patch)) continue;
    const value = toColumnValue(field, patch[field.name]);
    if (!isDeepStrictEqual(value, row[field.name] ?? null)) changed[field.name] = value;
  }
  return changed;
}

function okResult(version: number, changeSeq: number, rejected: Rejection[]): SyncOpResult {
  const seq = String(changeSeq);
  return rejected.length > 0
    ? { status: "partial", version, changeSeq: seq, rejected }
    : { status: "ok", version, changeSeq: seq };
}

/** op 하나를 적용한다. 같은 트랜잭션 안에서 ops 를 순서대로 부른다. */
export async function applyOp(tx: Tx, userId: string, raw: unknown): Promise<AppliedOp> {
  if (!isPlainObject(raw)) return { type: null, result: rejectOp("invalid") };
  const rt = typeof raw.type === "string" ? RECORD_TABLES.get(raw.type) : undefined;
  if (!rt) return { type: null, result: rejectOp("invalid") };
  const type = rt.definition.type;
  const op = raw.op as SyncOpKind;
  const id = raw.id;
  const validId =
    typeof id === "string" &&
    (rt.definition.key.kind === "singleton" ? id === userId : UUID_PATTERN.test(id));
  if (!OP_KINDS.includes(op) || !validId) return { type, result: rejectOp("invalid") };
  if (raw.fields !== undefined && !isPlainObject(raw.fields)) {
    return { type, result: rejectOp("invalid") };
  }
  const fields = (raw.fields ?? {}) as Record<string, unknown>;

  const derivedKey =
    op === "create" && rt.definition.key.kind === "derived" && typeof raw.parentId === "string"
      ? { parentId: raw.parentId, keyValue: fields[rt.definition.key.name] }
      : undefined;
  const row = await findRow(tx, rt, id, derivedKey);

  if (op === "delete") return { type, result: await deleteRecord(tx, userId, rt, id, row) };
  if (row) {
    // 이미 있는 레코드에 대한 create (재전송) 는 패치다. 키를 정한 필드는 레코드를 찾는 데 썼으니 뺀다.
    const patchFields = op === "create" ? omitKeyFields(rt, fields) : fields;
    return { type, result: await patchRecord(tx, userId, rt, row, patchFields, raw.sortKey) };
  }
  if (op === "patch") return { type, result: rejectOp("not_found") };
  return {
    type,
    result: await createRecord(tx, userId, rt, id, raw.parentId, fields, raw.sortKey),
  };
}

async function createRecord(
  tx: Tx,
  userId: string,
  rt: RecordTable,
  id: string,
  parentId: unknown,
  fields: Record<string, unknown>,
  sortKeyInput: unknown
): Promise<SyncOpResult> {
  const { definition } = rt;
  const { patch, rejected } = parsePatch(definition, fields, { op: "create" });
  // 필수 필드가 빠졌거나 잘못돼 레코드를 완성할 수 없다.
  if (Object.keys(definition.fields).some((name) => !(name in patch))) {
    return rejectOp("invalid", rejected);
  }

  let parent: string | null = null;
  if (rt.parent) {
    if (typeof parentId !== "string" || !UUID_PATTERN.test(parentId)) return rejectOp("invalid");
    const parentRow = await findParent(tx, rt, parentId);
    if (!parentRow) return rejectOp("parent_missing");
    if (parentRow.userId !== userId) return rejectOp("forbidden");
    if (parentRow.deletedAt) return rejectOp("parent_deleted");
    parent = parentId;
  }
  if (
    definition.key.kind === "derived" &&
    id !== deriveRecordId(definition, { parentId: parent ?? undefined, fields: patch })
  ) {
    return rejectOp("invalid");
  }

  let sortKey: string | null = null;
  if (rt.sortKey) {
    if (isValidSortKey(sortKeyInput)) sortKey = sortKeyInput;
    else {
      if (sortKeyInput !== undefined) rejected.push({ field: "sortKey", code: "type" });
      sortKey = await sortKeyAtEnd(tx, rt, userId, parent);
    }
  }

  const changeSeq = await nextSeq(tx, userId);
  const values: Row = {
    [rt.key.name]: id,
    userId,
    version: 1,
    changeSeq,
    updatedAt: sql`now()`,
  };
  if (rt.parent) values[rt.parent.name] = parent;
  if (rt.sortKey) values.sortKey = sortKey;
  for (const field of rt.fields) values[field.name] = toColumnValue(field, patch[field.name]);
  await tx.insert(asTable(rt)).values(values as never);
  return okResult(1, changeSeq, rejected);
}

async function patchRecord(
  tx: Tx,
  userId: string,
  rt: RecordTable,
  row: Row,
  fields: Record<string, unknown>,
  sortKeyInput: unknown
): Promise<SyncOpResult> {
  const parentRow = rt.parent ? await findParent(tx, rt, row[rt.parent.name]) : null;
  if (ownerOf(row, parentRow) !== userId) return rejectOp("forbidden");
  if (row.deletedAt) return rejectOp("deleted");
  if (parentRow?.deletedAt) return rejectOp("parent_deleted");

  const { patch, rejected } = parsePatch(rt.definition, fields, { op: "patch" });
  const changed = changedColumns(rt, patch, row);
  if (sortKeyInput !== undefined) {
    if (!rt.sortKey || !isValidSortKey(sortKeyInput)) {
      rejected.push({ field: "sortKey", code: "type" });
    } else if (sortKeyInput !== row.sortKey) {
      changed.sortKey = sortKeyInput;
    }
  }

  const version = row.version as number;
  if (Object.keys(changed).length === 0) {
    if (rejected.length > 0 && Object.keys(patch).length === 0) {
      return rejectOp("invalid", rejected);
    }
    return okResult(version, row.changeSeq as number, rejected);
  }

  const changeSeq = await nextSeq(tx, userId);
  await tx
    .update(asTable(rt))
    .set({
      ...changed,
      userId,
      version: version + 1,
      changeSeq,
      updatedAt: sql`now()`,
    } as never)
    .where(eq(rt.key, row[rt.key.name]));
  return okResult(version + 1, changeSeq, rejected);
}

async function deleteRecord(
  tx: Tx,
  userId: string,
  rt: RecordTable,
  id: string,
  row: Row | null
): Promise<SyncOpResult> {
  // 설정은 계정마다 늘 하나라 지우지 않는다.
  if (rt.definition.key.kind === "singleton") return rejectOp("invalid");
  // 없는 레코드 삭제는 성공 (재전송에 안전). 톰스톤을 새로 만들지 않는다.
  if (!row) return { status: "ok" };
  const parentRow = rt.parent ? await findParent(tx, rt, row[rt.parent.name]) : null;
  if (ownerOf(row, parentRow) !== userId) return rejectOp("forbidden");
  const version = row.version as number;
  if (row.deletedAt) return okResult(version, row.changeSeq as number, []);

  const changeSeq = await nextSeq(tx, userId);
  await tx
    .update(asTable(rt))
    .set({
      userId,
      deletedAt: sql`now()`,
      version: version + 1,
      changeSeq,
      updatedAt: sql`now()`,
    } as never)
    .where(eq(rt.key, id));
  await tombstoneChildren(tx, userId, rt, id);
  return okResult(version + 1, changeSeq, []);
}

/** 부모를 지울 때 살아 있는 하위 레코드에 톰스톤을 찍는다. 레코드마다 번호를 하나씩 받는다. */
async function tombstoneChildren(tx: Tx, userId: string, rt: RecordTable, parentId: string) {
  for (const child of rt.children) {
    if (!child.parent) continue;
    const rows = (await tx
      .select({ id: child.key, version: child.version })
      .from(asTable(child) as never)
      .where(and(eq(child.parent, parentId), isNull(child.deletedAt)))
      .orderBy(child.key)) as Array<{ id: string; version: number }>;
    if (rows.length === 0) continue;
    const { first } = await reserveChangeSeqs(tx, userId, rows.length);
    for (const [i, row] of rows.entries()) {
      await tx
        .update(asTable(child))
        .set({
          userId,
          deletedAt: sql`now()`,
          version: row.version + 1,
          changeSeq: first + i,
          updatedAt: sql`now()`,
        } as never)
        .where(eq(child.key, row.id));
      await tombstoneChildren(tx, userId, child, row.id);
    }
  }
}

// ─── pull ───────────────────────────────────────────────────────────────────

export interface ChangeRange {
  /** 이 번호 다음부터. */
  after: number;
  /** 이 번호까지 (읽기 시작할 때의 사용자 번호 — 그 아래는 모두 커밋됐다). */
  upTo: number;
  /** 이 번호 이하의 톰스톤은 빼고 준다 (첫 동기화: 기기가 본 적 없는 삭제). */
  skipTombstonesUpTo: number;
  limit: number;
}

function toPulled(rt: RecordTable, row: Row): PulledRecord {
  const fields: Record<string, unknown> = {};
  for (const field of rt.fields) fields[field.name] = fromColumnValue(field, row[field.name]);
  const deletedAt = row.deletedAt as Date | null;
  return {
    type: rt.definition.type,
    id: String(row[rt.key.name]),
    parentId: rt.parent ? String(row[rt.parent.name]) : null,
    version: row.version as number,
    changeSeq: String(row.changeSeq),
    deletedAt: deletedAt ? deletedAt.toISOString() : null,
    sortKey: rt.sortKey ? ((row.sortKey as string | null) ?? null) : null,
    fields,
  };
}

/**
 * `changeSeq` 가 (after, upTo] 인 레코드를 번호 순으로 최대 `limit + 1` 개 (다음 페이지가 있는지
 * 알기 위해 하나 더). `changeSeq` 0 (v1 경로가 쓰고 아직 번호를 받지 않은 행) 은 나오지 않는다.
 */
export async function listChanges(
  db: Database,
  userId: string,
  range: ChangeRange
): Promise<PulledRecord[]> {
  const records: PulledRecord[] = [];
  // 테이블마다 차례로 (연결 수를 아낀다 — 운영 풀은 작다).
  for (const rt of RECORD_TABLES.values()) {
    const rows = (await db
      .select(rt.selection)
      .from(asTable(rt) as never)
      .where(
        and(
          eq(rt.userId, userId),
          gt(rt.changeSeq, range.after),
          lte(rt.changeSeq, range.upTo),
          or(isNull(rt.deletedAt), gt(rt.changeSeq, range.skipTombstonesUpTo))
        )
      )
      .orderBy(rt.changeSeq)
      .limit(range.limit + 1)) as Row[];
    for (const row of rows) records.push(toPulled(rt, row));
  }
  return records
    .sort((a, b) => Number(a.changeSeq) - Number(b.changeSeq))
    .slice(0, range.limit + 1);
}
