import {
  keyFields,
  parsePatch,
  RECORDS,
  type RecordDefinition,
  type Rejection,
  SCHEMA_VERSION,
} from "@seedbook/domain";
import { CanonicalJsonError, canonicalStringify, jsonEqual, sha256Hex } from "./canonical-json";
import type { SqlDriver, SqlStatement } from "./sql-driver";

/**
 * 기기 레코드 저장소 (설계 §2.5 · §5.7). 자산은 `records` 테이블 하나에 레코드 JSON 으로 둔다.
 *
 * **쓰기는 `writeRecords()` (와 같은 준비 단계를 쓰는 `prepareRecordWrites()`) 하나로만** 한다.
 * 다른 코드에서 `records` 에 직접 쓰지 않는다 (`record-store.test.ts` 가 소스를 검사한다).
 *
 *   1. 정의 검증 (`parsePatch`). 거부된 필드는 쓰지 않고 격리한다 — 기존 값이 그대로 남는다.
 *   2. 정규 직렬화 (`canonicalStringify`). `NaN`·`Infinity`·`undefined` 는 예외 → 레코드를 격리.
 *   3. 왕복 확인: 다시 parse 해 원래 값과 같은지.
 *   4. SHA-256 체크섬.
 *   5. 덮어쓰기 전 값을 `records_history` 에 (레코드당 최근 3개).
 *   6. 모두 한 트랜잭션. 각 행에 `schemaVersion`·`writtenBy` 를 함께 쓴다.
 *
 * 읽기는 행마다 parse → 체크섬 → 정의 검증을 하고, 실패한 행은 **지우지 않고** 격리 표시한 뒤
 * 이력의 가장 최근 정상 값을 돌려준다.
 *
 * 레코드는 **패치**로 쓴다: 넘긴 필드만 바꾸고, 정의에 없는 필드(옛 앱이 모르는 새 필드)는 기존
 * 행에 그대로 남는다 (§7.2).
 */

const DEFINITIONS = new Map<string, RecordDefinition>(RECORDS.map((d) => [d.type, d]));

/** 이력에 남기는 레코드당 개수. */
export const HISTORY_PER_RECORD = 3;

/** 격리 자리의 `field` — 레코드 전체. */
export const WHOLE = "*";

export type QuarantineSource = "write" | "read" | "legacy";

export type QuarantineCode =
  | Rejection["code"]
  | "incomplete"
  | "serialize"
  | "roundtrip"
  | "json"
  | "checksum"
  | "schema"
  | "invalid"
  | "legacy";

export interface QuarantineEntry {
  type: string;
  id: string;
  /** 필드 이름, 레코드 전체면 `*`. */
  field: string;
  source: QuarantineSource;
  code: QuarantineCode;
  /** 쓰려던 값·읽지 못한 행의 원본 (진단·복구용). */
  value: string | null;
}

export interface StoredRecord {
  type: string;
  id: string;
  parentId: string | null;
  data: Record<string, unknown>;
  sortKey: string | null;
  deletedAt: string | null;
  version: number;
  changeSeq: number | null;
  schemaVersion: number;
  writtenBy: string;
  createdAt: string;
  updatedAt: string;
}

export type RecordWrite =
  | {
      op: "put";
      type: string;
      id: string;
      /** 넘기면 바꾼다. 생략하면 기존 값 (새 레코드면 null). */
      parentId?: string | null;
      sortKey?: string | null;
      /** 정의로 검증하는 필드 (패치). */
      fields: Record<string, unknown>;
      /**
       * 정의에 없지만 함께 보관할 값 (v2-4b 전까지 store 가 쓰는 옛 필드). 검증하지 않고 직렬화
       * 확인만 한다.
       */
      extra?: Record<string, unknown>;
    }
  | { op: "delete"; type: string; id: string }
  /** 레코드로 나눌 수 없는 항목(키를 만들 수 없는 등)의 원본을 격리만 한다. */
  | {
      op: "quarantine";
      type: string;
      id: string;
      code: QuarantineCode;
      value: unknown;
      /** 기본 `write`. 옛 `device_quarantine` 에서 옮긴 항목은 `legacy`. */
      source?: QuarantineSource;
    };

export interface WriteContext {
  /** 쓰는 앱 번들 (`app-build.ts`). */
  writtenBy: string;
  now?: () => string;
}

export interface WriteOutcome {
  written: number;
  unchanged: number;
  deleted: number;
  quarantined: QuarantineEntry[];
}

interface RecordRowColumns {
  type: string;
  id: string;
  parentId: string | null;
  data: string;
  checksum: string;
  schemaVersion: number;
  writtenBy: string;
  version: number;
  changeSeq: number | null;
  deletedAt: string | null;
  sortKey: string | null;
  createdAt: string;
  updatedAt: string;
}

type HistoryRow = Pick<
  RecordRowColumns,
  "parentId" | "data" | "checksum" | "schemaVersion" | "writtenBy" | "deletedAt" | "sortKey"
>;

const key = (type: string, id: string) => `${type}\u0000${id}`;

function rawText(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return String(value);
  }
}

// ─── 검증 (읽기·쓰기 공용) ────────────────────────────────────────────────────

type Verified = { ok: true; data: Record<string, unknown> } | { ok: false; code: QuarantineCode };

/** 저장된 행 하나를 확인한다: parse → 체크섬 → 버전 → 정의 검증. */
export async function verifyStoredRow(type: string, row: HistoryRow): Promise<Verified> {
  let data: unknown;
  try {
    data = JSON.parse(row.data);
  } catch {
    return { ok: false, code: "json" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, code: "json" };
  }
  if ((await sha256Hex(row.data)) !== row.checksum) return { ok: false, code: "checksum" };
  if (Number(row.schemaVersion) > SCHEMA_VERSION) return { ok: false, code: "schema" };
  const definition = DEFINITIONS.get(type);
  // 모르는 타입(새 앱이 만든 레코드)은 그대로 둔다 (§7.4).
  if (definition) {
    const { rejected } = parsePatch(definition, data, { op: "create", enums: "open" });
    if (rejected.length > 0) return { ok: false, code: "invalid" };
  }
  return { ok: true, data: data as Record<string, unknown> };
}

async function recoverFromHistory(
  driver: SqlDriver,
  type: string,
  id: string
): Promise<HistoryRow | null> {
  const history = await driver.query<HistoryRow>(
    `SELECT parentId, data, checksum, schemaVersion, writtenBy, deletedAt, sortKey
       FROM records_history WHERE type = ? AND id = ? ORDER BY seq DESC`,
    [type, id]
  );
  for (const row of history) {
    if ((await verifyStoredRow(type, row)).ok) return row;
  }
  return null;
}

function quarantineStatement(entry: QuarantineEntry, at: string, checksum?: string): SqlStatement {
  return {
    sql: `INSERT OR REPLACE INTO records_quarantine (type, id, field, source, code, value, checksum, at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      entry.type,
      entry.id,
      entry.field,
      entry.source,
      entry.code,
      entry.value,
      checksum ?? null,
      at,
    ],
  };
}

// ─── 쓰기 ───────────────────────────────────────────────────────────────────

interface Current {
  row: RecordRowColumns;
  /** 검증을 통과한 기존 값 (손상됐으면 이력에서 복구한 값, 그것도 없으면 null). */
  data: Record<string, unknown> | null;
  /** 행이 JSON 으로 읽히는지 — 아니면 이력에 옮길 수 없다 (이력도 json_valid 제약). */
  historyable: boolean;
}

async function loadCurrent(
  driver: SqlDriver,
  writes: RecordWrite[]
): Promise<Map<string, Current>> {
  const current = new Map<string, Current>();
  const types = [...new Set(writes.map((w) => w.type))];
  for (const type of types) {
    const rows = await driver.query<RecordRowColumns>("SELECT * FROM records WHERE type = ?", [
      type,
    ]);
    const wanted = new Set(writes.filter((w) => w.type === type).map((w) => w.id));
    for (const row of rows) {
      if (!wanted.has(row.id)) continue;
      const verified = await verifyStoredRow(type, row);
      let data = verified.ok ? verified.data : null;
      if (!verified.ok) {
        const recovered = await recoverFromHistory(driver, type, row.id);
        data = recovered ? (JSON.parse(recovered.data) as Record<string, unknown>) : null;
      }
      const historyable = verified.ok || verified.code !== "json";
      current.set(key(type, row.id), { row, data, historyable });
    }
  }
  return current;
}

function historyStatements(row: RecordRowColumns, savedAt: string): SqlStatement[] {
  return [
    {
      sql: `INSERT INTO records_history (type, id, parentId, data, checksum, schemaVersion, writtenBy,
              deletedAt, sortKey, savedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        row.type,
        row.id,
        row.parentId,
        row.data,
        row.checksum,
        row.schemaVersion,
        row.writtenBy,
        row.deletedAt,
        row.sortKey,
        savedAt,
      ],
    },
    {
      sql: `DELETE FROM records_history WHERE type = ? AND id = ? AND seq NOT IN (
              SELECT seq FROM records_history WHERE type = ? AND id = ? ORDER BY seq DESC LIMIT ?)`,
      params: [row.type, row.id, row.type, row.id, HISTORY_PER_RECORD],
    },
  ];
}

/**
 * 쓰기를 검증·직렬화해 한 트랜잭션에 넣을 문장으로 만든다. 같은 레코드를 여러 번 넘기면 마지막
 * 것만 쓴다. `writeRecords` 가 쓴다.
 */
export async function prepareRecordWrites(
  driver: SqlDriver,
  writes: RecordWrite[],
  context: WriteContext
): Promise<{ statements: SqlStatement[]; outcome: WriteOutcome }> {
  const now = (context.now ?? (() => new Date().toISOString()))();
  const last = new Map<string, RecordWrite>();
  for (const write of writes) {
    last.delete(key(write.type, write.id));
    last.set(key(write.type, write.id), write);
  }
  const unique = [...last.values()];
  const current = await loadCurrent(driver, unique);
  const statements: SqlStatement[] = [];
  const outcome: WriteOutcome = { written: 0, unchanged: 0, deleted: 0, quarantined: [] };
  const quarantine = (
    entry: Omit<QuarantineEntry, "source">,
    source: QuarantineSource = "write"
  ) => {
    const full = { ...entry, source };
    outcome.quarantined.push(full);
    statements.push(quarantineStatement(full, now));
  };

  for (const write of unique) {
    const existing = current.get(key(write.type, write.id));

    if (write.op === "quarantine") {
      quarantine(
        {
          type: write.type,
          id: write.id,
          field: WHOLE,
          code: write.code,
          value: typeof write.value === "string" ? write.value : rawText(write.value),
        },
        write.source
      );
      continue;
    }

    if (write.op === "delete") {
      if (!existing || existing.row.deletedAt !== null) continue;
      if (existing.historyable) statements.push(...historyStatements(existing.row, now));
      statements.push({
        sql: "UPDATE records SET deletedAt = ?, updatedAt = ? WHERE type = ? AND id = ?",
        params: [now, now, write.type, write.id],
      });
      outcome.deleted += 1;
      continue;
    }

    const base = existing?.data ?? null;
    const definition = DEFINITIONS.get(write.type);
    let patch: Record<string, unknown> = write.fields;
    if (definition) {
      // 키를 만드는 필드는 패치로 바꿀 수 없다 — 같은 값을 다시 보낸 것은 바꾼 것이 아니다.
      const fields = { ...write.fields };
      if (base) {
        for (const name of keyFields(definition)) {
          if (name in fields && jsonEqual(fields[name], base[name])) delete fields[name];
        }
      }
      const parsed = parsePatch(definition, fields, {
        op: base ? "patch" : "create",
        enums: "open",
      });
      patch = parsed.patch as Record<string, unknown>;
      for (const { field, code } of parsed.rejected) {
        quarantine({
          type: write.type,
          id: write.id,
          field,
          code,
          value: rawText(write.fields[field]),
        });
      }
      // 새 레코드인데 기본값도 없는 필드가 빠졌다 — 반쪽 레코드를 쓰지 않는다.
      if (!base && Object.keys(definition.fields).some((name) => !(name in patch))) {
        quarantine({
          type: write.type,
          id: write.id,
          field: WHOLE,
          code: "incomplete",
          value: rawText({ ...write.extra, ...write.fields }),
        });
        continue;
      }
    }

    const merged = { ...base, ...write.extra, ...patch };
    let text: string;
    try {
      text = canonicalStringify(merged);
    } catch (error) {
      if (!(error instanceof CanonicalJsonError)) throw error;
      quarantine({
        type: write.type,
        id: write.id,
        field: error.path || WHOLE,
        code: "serialize",
        value: rawText(merged),
      });
      continue;
    }
    if (!jsonEqual(JSON.parse(text), merged)) {
      quarantine({
        type: write.type,
        id: write.id,
        field: WHOLE,
        code: "roundtrip",
        value: text,
      });
      continue;
    }
    const checksum = await sha256Hex(text);
    const parentId =
      write.parentId !== undefined ? write.parentId : (existing?.row.parentId ?? null);
    const sortKey = write.sortKey !== undefined ? write.sortKey : (existing?.row.sortKey ?? null);

    if (
      existing &&
      existing.row.checksum === checksum &&
      existing.row.data === text &&
      existing.row.deletedAt === null &&
      existing.row.parentId === parentId &&
      existing.row.sortKey === sortKey &&
      Number(existing.row.schemaVersion) === SCHEMA_VERSION
    ) {
      outcome.unchanged += 1;
      continue;
    }

    if (existing?.historyable) statements.push(...historyStatements(existing.row, now));
    statements.push({
      sql: `INSERT INTO records (type, id, parentId, data, checksum, schemaVersion, writtenBy,
              deletedAt, sortKey, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
            ON CONFLICT(type, id) DO UPDATE SET parentId = excluded.parentId, data = excluded.data,
              checksum = excluded.checksum, schemaVersion = excluded.schemaVersion,
              writtenBy = excluded.writtenBy, deletedAt = NULL, sortKey = excluded.sortKey,
              updatedAt = excluded.updatedAt`,
      params: [
        write.type,
        write.id,
        parentId,
        text,
        checksum,
        SCHEMA_VERSION,
        context.writtenBy,
        sortKey,
        now,
        now,
      ],
    });
    outcome.written += 1;
  }
  return { statements, outcome };
}

/** 기기 레코드 쓰기의 단일 경로. 한 트랜잭션으로 저장한다. */
export async function writeRecords(
  driver: SqlDriver,
  writes: RecordWrite[],
  context: WriteContext
): Promise<WriteOutcome> {
  const { statements, outcome } = await prepareRecordWrites(driver, writes, context);
  if (statements.length > 0) await driver.batch(statements);
  if (outcome.quarantined.length > 0) {
    // 값은 남기지 않는다 (진단 로그는 건수·코드만, 설계 §5.7.2).
    console.warn(
      "[device-db] 검증·직렬화에 실패한 값을 쓰지 않고 격리했다",
      outcome.quarantined.map((q) => `${q.type}.${q.field}:${q.code}`)
    );
  }
  return outcome;
}

// ─── 읽기 ───────────────────────────────────────────────────────────────────

export interface ReadOptions {
  types: string[];
  /** 톰스톤도 돌려준다. */
  includeDeleted?: boolean;
}

export interface ReadResult {
  records: StoredRecord[];
  /** 이번 읽기에서 손상·검증 실패로 격리한 행 (이력에서 복구했든 못 했든). */
  quarantined: QuarantineEntry[];
}

function toStored(row: RecordRowColumns, from: HistoryRow, data: Record<string, unknown>) {
  return {
    type: row.type,
    id: row.id,
    parentId: from.parentId,
    data,
    sortKey: from.sortKey,
    deletedAt: from.deletedAt,
    version: Number(row.version),
    changeSeq: row.changeSeq === null ? null : Number(row.changeSeq),
    schemaVersion: Number(from.schemaVersion),
    writtenBy: from.writtenBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } satisfies StoredRecord;
}

/**
 * 레코드를 확인하며 읽는다. 확인에 실패한 행은 지우지 않고 격리 목록에 원본을 남긴 뒤, 이력의
 * 가장 최근 정상 값을 돌려준다 (없으면 그 레코드는 결과에서 빠진다 — 행은 그대로 있다).
 * 정렬: 타입 → sortKey → rowid.
 */
export async function readRecords(driver: SqlDriver, options: ReadOptions): Promise<ReadResult> {
  if (options.types.length === 0) return { records: [], quarantined: [] };
  const rows = await driver.query<RecordRowColumns>(
    `SELECT * FROM records WHERE type IN (${options.types.map(() => "?").join(", ")})
       ${options.includeDeleted ? "" : "AND deletedAt IS NULL"}
     ORDER BY type, sortKey IS NULL, sortKey, rowid`,
    options.types
  );
  const records: StoredRecord[] = [];
  const quarantined: QuarantineEntry[] = [];
  const statements: SqlStatement[] = [];
  const now = new Date().toISOString();

  for (const row of rows) {
    const verified = await verifyStoredRow(row.type, row);
    if (verified.ok) {
      records.push(toStored(row, row, verified.data));
      continue;
    }
    const entry: QuarantineEntry = {
      type: row.type,
      id: row.id,
      field: WHOLE,
      source: "read",
      code: verified.code,
      value: row.data,
    };
    quarantined.push(entry);
    statements.push(quarantineStatement(entry, now, row.checksum));
    const recovered = await recoverFromHistory(driver, row.type, row.id);
    if (recovered && (options.includeDeleted || recovered.deletedAt === null)) {
      records.push(toStored(row, recovered, JSON.parse(recovered.data)));
    }
  }

  if (statements.length > 0) {
    console.warn(
      "[device-db] 확인에 실패한 레코드를 격리했다",
      quarantined.map((q) => `${q.type}:${q.code}`)
    );
    try {
      await driver.batch(statements);
    } catch (error) {
      // 격리 기록에 실패해도 읽기는 돌려준다 (행은 그대로라 다음 읽기에서 다시 격리한다).
      console.warn("[device-db] 격리 기록 실패", error);
    }
  }
  return { records, quarantined };
}

/** 격리 목록 (오래된 것부터). */
export async function readQuarantine(driver: SqlDriver): Promise<QuarantineEntry[]> {
  return driver.query<QuarantineEntry>(
    "SELECT type, id, field, source, code, value FROM records_quarantine ORDER BY at, rowid"
  );
}

/** 레코드·이력·격리·동기화 자리를 모두 비운다 (회원 탈퇴). */
export async function clearRecords(driver: SqlDriver): Promise<void> {
  await driver.batch(
    ["records", "records_history", "records_quarantine", "sync_outbox", "sync_shadow"].map(
      (table) => ({ sql: `DELETE FROM ${table}` })
    )
  );
}
