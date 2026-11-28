import { keyFields, parsePatch } from "@seedbook/domain";
import { CanonicalJsonError, canonicalStringify } from "@web/lib/native/device-db/canonical-json";
import {
  type RecordWrite,
  readRecords,
  WHOLE,
  writeRecords,
} from "@web/lib/native/device-db/record-store";
import type { SqlDriver } from "@web/lib/native/device-db/sql-driver";
import type { RecordChange } from "./changes";
import {
  definitionOf,
  knownFields,
  type LocalRecord,
  otherFields,
  type RecordMap,
  recordKey,
  SYNCED_TYPES,
  sameValue,
} from "./records";
import type { QuarantineNote } from "./sync-state";

/**
 * 기기 레코드 저장소 (설계 §2.5·§5.4). 앱 SQLite 는 `records` 테이블(`writeRecords()` 하나로 쓴다),
 * 브라우저·앱의 다른 계정 자리는 계정별 키 하나에 JSON 으로 둔다. 둘 다 같은 규칙이다:
 *
 * - `put` 은 패치 — 넘긴 필드만 바꾸고 다른 필드는 그대로 (`{...기존, ...아는 필드}`).
 * - 정의로 검증해 받지 못한 필드는 쓰지 않고 격리한다. 새 레코드인데 필수 필드가 빠졌으면 레코드를 쓰지
 *   않고 격리한다. 기존 값은 그대로 남는다 — 검증 때문에 지우는 일은 없다.
 * - 지우기는 사용자가 지운 레코드의 `delete` 로만.
 */
export interface DeviceRecordStore {
  /** 살아 있는 동기화 레코드 전부. */
  load(): Promise<RecordMap>;
  apply(changes: RecordChange[]): Promise<{ quarantined: Omit<QuarantineNote, "at">[] }>;
  /** 이 타입들의 레코드를 한 번이라도 저장했는지 (모두 지웠어도 true). */
  everStored(types: string[]): Promise<boolean>;
}

// ─── 키 하나에 JSON (브라우저) ────────────────────────────────────────────────

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface RecordDocument {
  v: 1;
  /** 한 번이라도 저장한 타입. */
  stored: string[];
  records: Record<string, LocalRecord>;
}

function readDocument(kv: KeyValue, key: string): RecordDocument | null {
  const raw = kv.getItem(key);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as RecordDocument;
    if (parsed?.v === 1 && typeof parsed.records === "object" && parsed.records !== null) {
      const stored = Array.isArray(parsed.stored) ? parsed.stored : [];
      return { v: 1, stored, records: parsed.records };
    }
  } catch {
    // 아래에서 원본을 남긴다.
  }
  // 우리가 통째로 쓰는 값이라 일어나지 않아야 한다. 지우지 않고 옆 키에 원본을 남긴 뒤 빈 것으로 시작한다
  // (cloud 모드면 다음 동기화가 서버에서 다시 받는다).
  const aside = `${key}.unreadable`;
  if (kv.getItem(aside) === null) kv.setItem(aside, raw);
  console.warn(`[sync] 기기 레코드(${key})를 읽지 못해 ${aside} 에 남겼다`);
  return null;
}

type Quarantined = Omit<QuarantineNote, "at">;

/**
 * 레코드 하나에 패치를 검증해 얹는다. 쓸 수 없으면 null (격리 목록에 사유).
 * `existing` 이 없으면 새 레코드다.
 */
export function mergeRecordPatch(
  existing: LocalRecord | undefined,
  change: Extract<RecordChange, { op: "put" }>,
  quarantined: Quarantined[]
): LocalRecord | null {
  const definition = definitionOf(change.type);
  const note = (field: string, code: string, value: unknown) =>
    quarantined.push({ type: change.type, id: change.id, field, code, value });
  let patch: Record<string, unknown> = change.fields;
  if (definition) {
    const known = knownFields(change.type, change.fields);
    if (existing) {
      // 키를 만드는 필드는 바꿀 수 없다 — 같은 값을 다시 넘긴 것은 바꾼 것이 아니다.
      for (const name of keyFields(definition)) {
        if (name in known && sameValue(known[name], existing.fields[name])) delete known[name];
      }
    }
    const parsed = parsePatch(definition, known, {
      op: existing ? "patch" : "create",
      enums: "open",
    });
    for (const { field, code } of parsed.rejected) note(field, code, known[field] ?? null);
    if (!existing && Object.keys(definition.fields).some((name) => !(name in parsed.patch))) {
      note(WHOLE, "incomplete", change.fields);
      return null;
    }
    patch = { ...otherFields(change.type, change.fields), ...parsed.patch };
  }
  const merged: LocalRecord = {
    type: change.type,
    id: change.id,
    parentId: change.parentId,
    sortKey: change.sortKey,
    fields: { ...existing?.fields, ...patch },
  };
  try {
    canonicalStringify(merged);
  } catch (error) {
    if (!(error instanceof CanonicalJsonError)) throw error;
    note(error.path || WHOLE, "serialize", null);
    return null;
  }
  return merged;
}

export function createKvRecordStore(kv: KeyValue, key: string): DeviceRecordStore {
  const read = () => readDocument(kv, key) ?? { v: 1 as const, stored: [], records: {} };
  return {
    load: async () => {
      const map: RecordMap = new Map();
      for (const record of Object.values(read().records)) {
        if (SYNCED_TYPES.includes(record.type)) map.set(recordKey(record.type, record.id), record);
      }
      return map;
    },
    apply: async (changes) => {
      const doc = read();
      const quarantined: Quarantined[] = [];
      const stored = new Set(doc.stored);
      for (const change of changes) {
        const k = recordKey(change.type, change.id);
        stored.add(change.type);
        if (change.op === "delete") {
          delete doc.records[k];
          continue;
        }
        const merged = mergeRecordPatch(doc.records[k], change, quarantined);
        if (merged) doc.records[k] = merged;
      }
      kv.setItem(key, JSON.stringify({ v: 1, stored: [...stored], records: doc.records }));
      return { quarantined };
    },
    everStored: async (types) => {
      const doc = readDocument(kv, key);
      return !!doc && types.some((t) => doc.stored.includes(t));
    },
  };
}

// ─── 앱 SQLite `records` ────────────────────────────────────────────────────

export function createSqlRecordStore(driver: SqlDriver, writtenBy: string): DeviceRecordStore {
  return {
    load: async () => {
      const { records, quarantined } = await readRecords(driver, { types: [...SYNCED_TYPES] });
      if (quarantined.length > 0) sqlQuarantineListeners.forEach((l) => l(quarantined.length));
      const map: RecordMap = new Map();
      for (const r of records) {
        map.set(recordKey(r.type, r.id), {
          type: r.type,
          id: r.id,
          parentId: r.parentId,
          sortKey: r.sortKey,
          fields: r.data,
        });
      }
      return map;
    },
    apply: async (changes) => {
      const writes: RecordWrite[] = changes.map((change) =>
        change.op === "delete"
          ? { op: "delete", type: change.type, id: change.id }
          : {
              op: "put",
              type: change.type,
              id: change.id,
              parentId: change.parentId,
              sortKey: change.sortKey,
              fields: knownFields(change.type, change.fields),
              extra: otherFields(change.type, change.fields),
            }
      );
      const outcome = await writeRecords(driver, writes, { writtenBy });
      return {
        quarantined: outcome.quarantined.map((q) => ({
          type: q.type,
          id: q.id,
          field: q.field,
          code: q.code,
          value: q.value,
        })),
      };
    },
    everStored: async (types) => {
      if (types.length === 0) return false;
      const rows = await driver.query(
        `SELECT 1 FROM records WHERE type IN (${types.map(() => "?").join(", ")}) LIMIT 1`,
        types
      );
      return rows.length > 0;
    },
  };
}

/** 읽다가 손상·검증 실패로 격리한 행이 생겼을 때 (설계 §5.8 의 격리 표시). */
const sqlQuarantineListeners = new Set<(count: number) => void>();

export function onSqlReadQuarantine(listener: (count: number) => void): () => void {
  sqlQuarantineListeners.add(listener);
  return () => sqlQuarantineListeners.delete(listener);
}
