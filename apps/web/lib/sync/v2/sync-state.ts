import {
  MAX_PUSH_BYTES,
  MAX_PUSH_OPS,
  type PulledRecord,
  type Rejection,
  type SyncOp,
  type SyncOpResult,
} from "@seedbook/domain";
import { type RecordChange, withDescendants } from "./changes";
import {
  changedKnownFields,
  definitionOf,
  isSortable,
  knownFields,
  type LocalRecord,
  type RecordMap,
  recordKey,
  SYNCED_TYPES,
  sameValue,
  typeRank,
} from "./records";

/**
 * 동기화 v2 의 기기 쪽 상태와 순수 전환 (설계 §5.1·§5.2). 네트워크·저장소는 모른다 — 엔진이 이
 * 함수들로 다음 상태를 계산하고 저장한다.
 *
 * - **섀도**: 레코드별로 서버가 마지막으로 알려 준 값 (전체 필드, 앱이 모르는 필드 포함). diff 의 기준.
 * - **outbox**: 아직 서버가 받지 않은 변경. 레코드당 하나로 합친다 (나중 값이 이김). 삭제가 들어오면
 *   패치는 버리고, 서버가 모르는 레코드면 outbox 에서도 지운다. 전송 중에 다시 바뀌면 `seq` 로 가린다.
 */

export interface OutboxEntry {
  type: string;
  id: string;
  op: "create" | "patch" | "delete";
  parentId: string | null;
  /** 바꾼 필드 (create 는 아는 필드 전체). */
  fields: Record<string, unknown>;
  /** 바꾼 목록 순서. 바꾸지 않았으면 없다. */
  sortKey?: string;
  seq: number;
}

export interface ShadowEntry {
  parentId: string | null;
  version: number;
  changeSeq: string;
  sortKey: string | null;
  fields: Record<string, unknown>;
}

export interface SyncState {
  v: 2;
  /** pull 커서 (서버가 준 불투명한 값). null 이면 처음부터 받는다. */
  cursor: string | null;
  /** outbox 항목마다 붙이는 증가 번호. */
  seq: number;
  outbox: Record<string, OutboxEntry>;
  shadow: Record<string, ShadowEntry>;
  /** 마지막으로 push·pull 을 모두 마친 시각 (ISO). */
  lastSuccessAt: string | null;
  /** 이 상태를 만든 시각 — 한 번도 성공하지 못했을 때 얼마나 오래됐는지 본다. */
  startedAt: string;
}

export function emptySyncState(now: string): SyncState {
  return {
    v: 2,
    cursor: null,
    seq: 0,
    outbox: {},
    shadow: {},
    lastSuccessAt: null,
    startedAt: now,
  };
}

/** 서버에 보내지 못한 값 (진단·복구용 — 사용자에게 목록을 보여 주지 않는다, 설계 §5.8). */
export interface QuarantineNote {
  type: string;
  id: string;
  /** 필드 이름, 레코드 전체면 `*`. */
  field: string;
  code: string;
  value: unknown;
  at: string;
}

const isSynced = (type: string) => SYNCED_TYPES.includes(type);

// ─── 로컬 변경 → outbox ─────────────────────────────────────────────────────

/**
 * 기기 레코드가 `before` → `after` 로 바뀐 것을 outbox 에 기록한다. 실제로 저장된 결과를 비교하므로
 * 기기 검증에 걸려 쓰지 않은 값은 보내지 않는다.
 */
export function recordLocalChanges(
  state: SyncState,
  before: RecordMap,
  after: RecordMap
): SyncState {
  let seq = state.seq;
  const outbox = { ...state.outbox };
  const keys = new Set([...before.keys(), ...after.keys()]);

  for (const k of keys) {
    const prev = before.get(k);
    const next = after.get(k);
    const record = (next ?? prev) as LocalRecord;
    if (!isSynced(record.type)) continue;
    const shadow = state.shadow[k];
    const entry = outbox[k];

    if (!next) {
      if (!prev) continue;
      seq += 1;
      // 서버가 모르는 레코드 — 보낼 것도 지울 것도 없다.
      if (!shadow) delete outbox[k];
      else outbox[k] = { ...base(record), op: "delete", fields: {}, seq };
      continue;
    }

    const sortKey = changedSortKey(prev?.sortKey ?? shadow?.sortKey ?? null, next);
    const patch = changedKnownFields(record.type, prev?.fields ?? null, next.fields);
    const isNew = !prev;
    if (!isNew && Object.keys(patch).length === 0 && sortKey === undefined) continue;

    seq += 1;
    if (!shadow && entry?.op !== "patch") {
      // 서버에 없는 레코드 — 아는 필드 전체로 만든다.
      outbox[k] = {
        ...base(next),
        op: "create",
        fields: knownFields(next.type, next.fields),
        ...sortKeyField(next),
        seq,
      };
      continue;
    }
    if (entry && entry.op !== "delete") {
      outbox[k] = {
        ...entry,
        fields: { ...entry.fields, ...patch },
        ...(sortKey !== undefined ? { sortKey } : {}),
        seq,
      };
      continue;
    }
    // 섀도가 있다 — 서버 값과 다른 필드만 (지우려다 다시 생긴 레코드도 서버 값 기준으로).
    const fields = changedKnownFields(next.type, shadow?.fields ?? null, next.fields);
    const shadowSort = changedSortKey(shadow?.sortKey ?? null, next);
    if (Object.keys(fields).length === 0 && shadowSort === undefined) {
      delete outbox[k];
      continue;
    }
    outbox[k] = {
      ...base(next),
      op: "patch",
      fields,
      ...(shadowSort !== undefined ? { sortKey: shadowSort } : {}),
      seq,
    };
  }
  return seq === state.seq ? state : { ...state, outbox, seq };
}

const base = (record: LocalRecord) => ({
  type: record.type,
  id: record.id,
  parentId: record.parentId,
});

function changedSortKey(previous: string | null, next: LocalRecord): string | undefined {
  if (!isSortable(next.type) || next.sortKey === null) return undefined;
  return next.sortKey === previous ? undefined : next.sortKey;
}

function sortKeyField(record: LocalRecord): { sortKey?: string } {
  return isSortable(record.type) && record.sortKey !== null ? { sortKey: record.sortKey } : {};
}

/** 로컬 레코드 전체를 서버에 없는 것으로 보고 outbox 에 넣는다 (이미 항목이 있는 레코드는 그대로). */
export function enqueueCreates(state: SyncState, records: LocalRecord[]): SyncState {
  let seq = state.seq;
  const outbox = { ...state.outbox };
  for (const record of records) {
    const k = recordKey(record.type, record.id);
    if (!isSynced(record.type) || outbox[k]) continue;
    seq += 1;
    outbox[k] = {
      ...base(record),
      op: "create",
      fields: knownFields(record.type, record.fields),
      ...sortKeyField(record),
      seq,
    };
  }
  return { ...state, outbox, seq };
}

// ─── push ───────────────────────────────────────────────────────────────────

export interface SentOp {
  key: string;
  seq: number;
  op: SyncOp;
}

/** 서버가 레코드를 찾을 때 쓰는 id (설정 같은 싱글턴은 사용자 id). */
export function toSyncOp(entry: OutboxEntry): SyncOp {
  if (entry.op === "delete") return { type: entry.type, id: entry.id, op: "delete" };
  const op: SyncOp = { type: entry.type, id: entry.id, op: entry.op, fields: entry.fields };
  if (entry.op === "create" && entry.parentId !== null) op.parentId = entry.parentId;
  if (entry.sortKey !== undefined) op.sortKey = entry.sortKey;
  return op;
}

/** 본문 크기 여유 (`{"ops":[…]}` 와 구분자). */
const BODY_MARGIN = 1_000;

/**
 * 다음 push 묶음. 부모 타입이 먼저 (같은 요청 안에서 부모 create 뒤에 하위 create), 그다음 기록 순.
 * 최대 200 ops, 본문 1MB 를 넘지 않게 나눈다.
 */
export function nextPushBatch(state: SyncState): SentOp[] {
  const entries = Object.entries(state.outbox).sort(([, a], [, b]) => {
    const rank = typeRank(a.type) - typeRank(b.type);
    return rank !== 0 ? rank : a.seq - b.seq;
  });
  const batch: SentOp[] = [];
  let bytes = BODY_MARGIN;
  for (const [key, entry] of entries) {
    if (batch.length >= MAX_PUSH_OPS) break;
    const op = toSyncOp(entry);
    const size = new TextEncoder().encode(JSON.stringify(op)).length + 1;
    if (batch.length > 0 && bytes + size > MAX_PUSH_BYTES) break;
    bytes += size;
    batch.push({ key, seq: entry.seq, op });
  }
  return batch;
}

export interface PushOutcome {
  state: SyncState;
  /** 기기 레코드에 되돌릴 변경 (거부된 값 → 서버 값, 다른 기기가 지운 레코드). */
  changes: RecordChange[];
  quarantine: Omit<QuarantineNote, "at">[];
}

/** create 가 일부 필드를 거부당하면 서버는 기본값을 넣는다. */
function createdFields(type: string, sent: Record<string, unknown>, rejected: Set<string>) {
  const fields: Record<string, unknown> = {};
  const definition = definitionOf(type);
  for (const [name, value] of Object.entries(sent)) if (!rejected.has(name)) fields[name] = value;
  for (const name of rejected) {
    const fallback = definition?.fields[name]?.spec.default;
    if (fallback) fields[name] = structuredClone(fallback.value);
  }
  return fields;
}

/**
 * push 결과를 반영한다 (`results` 는 `sent` 와 같은 순서). 결과를 기다리는 동안 같은 레코드가 또
 * 바뀌었으면 (seq 가 다름) outbox 항목은 남긴다.
 */
export function applyPushResults(
  state: SyncState,
  sent: SentOp[],
  results: SyncOpResult[],
  local: RecordMap
): PushOutcome {
  const outbox = { ...state.outbox };
  const shadow = { ...state.shadow };
  const changes: RecordChange[] = [];
  const quarantine: PushOutcome["quarantine"] = [];
  let seq = state.seq;
  const removedLocally = new Set<string>();

  const dropRecord = (type: string, id: string) => {
    for (const record of withDescendants(local, type, id)) {
      const k = recordKey(record.type, record.id);
      if (removedLocally.has(k)) continue;
      removedLocally.add(k);
      delete outbox[k];
      delete shadow[k];
      changes.push({ op: "delete", type: record.type, id: record.id });
    }
    const k = recordKey(type, id);
    delete outbox[k];
    delete shadow[k];
  };

  /** 거부된 필드는 서버 값(섀도)으로 되돌린다. 그 사이 다시 바뀌었으면 사용자의 새 값을 둔다. */
  const revert = (k: string, names: string[], sortKey: boolean) => {
    const record = local.get(k);
    const known = shadow[k];
    if (!record || !known || outbox[k]) return;
    const fields: Record<string, unknown> = {};
    for (const name of names) if (name in known.fields) fields[name] = known.fields[name];
    if (Object.keys(fields).length === 0 && !sortKey) return;
    changes.push({
      op: "put",
      type: record.type,
      id: record.id,
      parentId: record.parentId,
      sortKey: sortKey ? known.sortKey : record.sortKey,
      fields,
    });
  };

  sent.forEach(({ key: k, seq: sentSeq, op }, index) => {
    const result = results[index];
    if (!result) return; // 응답이 모자라면 다음에 다시 보낸다.
    const entry = outbox[k];
    const unchanged = entry?.seq === sentSeq;

    if (result.status === "rejected") {
      if (result.code === "deleted" || result.code === "parent_deleted") {
        // 다른 기기의 삭제가 이겼다 — 격리하지 않고 지운다 (설계 §5.2).
        dropRecord(op.type, op.id);
        return;
      }
      if (result.code === "not_found") {
        // 서버에 없다 — 섀도를 버리고 아는 필드 전체로 다시 만든다.
        delete shadow[k];
        const record = local.get(k);
        if (!record) {
          delete outbox[k];
          return;
        }
        seq += 1;
        outbox[k] = {
          ...base(record),
          op: "create",
          fields: knownFields(record.type, record.fields),
          ...sortKeyField(record),
          seq,
        };
        return;
      }
      quarantine.push({
        type: op.type,
        id: op.id,
        field: "*",
        code: result.code,
        value: { op: op.op, fields: op.fields ?? null, sortKey: op.sortKey ?? null },
      });
      if (unchanged) delete outbox[k];
      revert(k, Object.keys(op.fields ?? {}), op.sortKey !== undefined);
      return;
    }

    if (op.op === "delete") {
      delete shadow[k];
      if (unchanged) delete outbox[k];
      return;
    }

    const rejected = result.status === "partial" ? result.rejected : [];
    const rejectedNames = new Set(rejected.map((r: Rejection) => r.field));
    const previous = shadow[k];
    const sentFields = op.fields ?? {};
    const applied =
      op.op === "create" && !previous
        ? createdFields(op.type, sentFields, rejectedNames)
        : Object.fromEntries(Object.entries(sentFields).filter(([n]) => !rejectedNames.has(n)));
    const sortKeyRejected = rejectedNames.has("sortKey");
    shadow[k] = {
      parentId: op.parentId ?? previous?.parentId ?? local.get(k)?.parentId ?? null,
      version: result.version ?? previous?.version ?? 0,
      changeSeq: result.changeSeq ?? previous?.changeSeq ?? "0",
      sortKey:
        op.sortKey !== undefined && !sortKeyRejected ? op.sortKey : (previous?.sortKey ?? null),
      fields: { ...previous?.fields, ...applied },
    };
    for (const { field, code } of rejected) {
      quarantine.push({
        type: op.type,
        id: op.id,
        field,
        code,
        value: field === "sortKey" ? (op.sortKey ?? null) : (sentFields[field] ?? null),
      });
    }
    if (unchanged) delete outbox[k];
    else if (entry?.op === "create") outbox[k] = { ...entry, op: "patch" };
    if (rejected.length > 0) {
      revert(
        k,
        [...rejectedNames].filter((n) => n !== "sortKey"),
        sortKeyRejected
      );
    }
  });

  return { state: { ...state, outbox, shadow, seq }, changes, quarantine };
}

// ─── pull ───────────────────────────────────────────────────────────────────

export interface PullOutcome {
  state: SyncState;
  changes: RecordChange[];
}

/**
 * pull 로 받은 레코드를 반영한다. outbox 에 보내지 않은 변경이 있는 레코드는 그 변경을 서버 값 위에
 * 다시 얹는다 (필드 단위 — 서버의 다른 필드 변경은 받는다). 삭제는 이긴다 — 보내지 않은 변경도 버린다.
 *
 * `full` 이면 (커서 없이 처음부터 받았거나 서버가 데이터를 다시 만들었다) 받지 못한 레코드를 정리한다:
 * 전에 서버에 있었던 레코드는 지우고, 서버에 보낸 적 없는 레코드는 새로 만든다 (삭제된 레코드면
 * 서버가 `deleted` 로 거부해 지워진다).
 */
export function applyPulled(
  state: SyncState,
  records: PulledRecord[],
  local: RecordMap,
  options: { full: boolean; cursor: string }
): PullOutcome {
  const outbox = { ...state.outbox };
  const previousShadow = state.shadow;
  const shadow = options.full ? {} : { ...state.shadow };
  const changes: RecordChange[] = [];
  const received = new Set<string>();
  const deleted = new Set<string>();

  for (const record of records) {
    const k = recordKey(record.type, record.id);
    if (record.deletedAt !== null) {
      deleted.add(k);
      received.delete(k);
      delete outbox[k];
      delete shadow[k];
      if (local.has(k)) changes.push({ op: "delete", type: record.type, id: record.id });
      continue;
    }
    received.add(k);
    deleted.delete(k);
    shadow[k] = {
      parentId: record.parentId,
      version: record.version,
      changeSeq: record.changeSeq,
      sortKey: record.sortKey,
      fields: record.fields,
    };
    const entry = outbox[k];
    if (entry?.op === "delete") continue;
    if (entry?.op === "create") outbox[k] = { ...entry, op: "patch" };
    const change: RecordChange = {
      op: "put",
      type: record.type,
      id: record.id,
      parentId: record.parentId,
      sortKey: entry?.sortKey ?? record.sortKey,
      fields: { ...record.fields, ...entry?.fields },
    };
    const existing = local.get(k);
    const same =
      existing &&
      existing.parentId === change.parentId &&
      existing.sortKey === change.sortKey &&
      Object.entries(change.fields).every(([n, v]) => sameValue(existing.fields[n], v));
    if (!same) changes.push(change);
  }

  let next: SyncState = { ...state, outbox, shadow, cursor: options.cursor };
  if (!options.full) return { state: next, changes };

  // 처음부터 받았다 — 받지 못한 로컬 레코드 정리.
  const orphans: LocalRecord[] = [];
  for (const [k, record] of local) {
    if (!isSynced(record.type) || received.has(k) || deleted.has(k) || outbox[k]) continue;
    if (previousShadow[k]) changes.push({ op: "delete", type: record.type, id: record.id });
    else orphans.push(record);
  }
  next = enqueueCreates(next, orphans);
  return { state: next, changes };
}
