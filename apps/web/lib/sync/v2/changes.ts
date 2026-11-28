import { account } from "@seedbook/domain";
import { type LocalRecord, type RecordMap, recordKey, sameValue } from "./records";
import { type RecordStoreKey, STORE_SHAPES, type StorePlan } from "./store-records";

/**
 * 기기 레코드에 쓸 변경. `put` 은 패치다 — 넘긴 필드만 바꾸고 기존 레코드의 다른 필드(앱이 모르는
 * 서버 필드, 기기 전용 필드)는 그대로 둔다 (`{...기존, ...아는 필드}`, 설계 §5.1).
 */
export type RecordChange =
  | {
      op: "put";
      type: string;
      id: string;
      parentId: string | null;
      sortKey: string | null;
      fields: Record<string, unknown>;
    }
  | { op: "delete"; type: string; id: string };

/** 레코드에 넘긴 필드가 모두 같은지 (바꿀 것이 없는지). */
export function putChangesNothing(
  existing: LocalRecord | undefined,
  change: Extract<RecordChange, { op: "put" }>
): boolean {
  if (!existing) return false;
  if (existing.parentId !== change.parentId || existing.sortKey !== change.sortKey) return false;
  return Object.entries(change.fields).every(([name, value]) =>
    sameValue(existing.fields[name], value)
  );
}

/** 변경을 레코드 목록에 적용한 결과 (메모리, 패치 의미). */
export function applyChangesToMap(map: RecordMap, changes: RecordChange[]): RecordMap {
  const next = new Map(map);
  for (const change of changes) {
    const k = recordKey(change.type, change.id);
    if (change.op === "delete") {
      next.delete(k);
      continue;
    }
    const existing = next.get(k);
    next.set(k, {
      type: change.type,
      id: change.id,
      parentId: change.parentId,
      sortKey: change.sortKey,
      fields: { ...existing?.fields, ...change.fields },
    });
  }
  return next;
}

/**
 * store 저장 계획 → 기기 레코드 변경. 이 store 타입 중 계획에 없는 레코드는 지운다 (사용자가 지운
 * 항목 — 목록 통째 교체가 아니라 사라진 id 만, 설계 §5.4).
 *
 * `pendingLinks`: 포트폴리오가 먼저 저장돼 아직 레코드가 없는 계좌의 연결 (계좌 id → 포트폴리오 id).
 * 계좌가 처음 저장될 때 건다.
 */
export function planStoreChanges(
  key: RecordStoreKey,
  plan: StorePlan,
  current: RecordMap,
  pendingLinks: Map<string, string | null>
): RecordChange[] {
  const changes: RecordChange[] = [];
  const wanted = new Set<string>();
  for (const record of plan.records) {
    const k = recordKey(record.type, record.id);
    wanted.add(k);
    const fields = { ...record.fields };
    if (record.type === account.type && !current.has(k) && pendingLinks.has(record.id)) {
      fields.portfolioId = pendingLinks.get(record.id) ?? null;
      pendingLinks.delete(record.id);
    }
    const change = { op: "put" as const, ...record, fields };
    if (!putChangesNothing(current.get(k), change)) changes.push(change);
  }

  const types = new Set(STORE_SHAPES[key].types);
  for (const [k, record] of current) {
    if (types.has(record.type) && !wanted.has(k)) {
      changes.push({ op: "delete", type: record.type, id: record.id });
    }
  }

  for (const link of plan.links) {
    const k = recordKey(link.type, link.id);
    const existing = current.get(k);
    if (!existing) {
      pendingLinks.set(link.id, (link.fields.portfolioId as string | null) ?? null);
      continue;
    }
    const change = {
      op: "put" as const,
      type: link.type,
      id: link.id,
      parentId: existing.parentId,
      sortKey: existing.sortKey,
      fields: link.fields,
    };
    if (!putChangesNothing(existing, change)) changes.push(change);
  }
  return changes;
}

/** 레코드와 그 하위 레코드 (부모를 지우면 하위도 지운다). */
export function withDescendants(map: RecordMap, type: string, id: string): LocalRecord[] {
  const root = map.get(recordKey(type, id));
  if (!root) return [];
  const out: LocalRecord[] = [root];
  for (let i = 0; i < out.length; i += 1) {
    const parent = out[i] as LocalRecord;
    for (const record of map.values()) {
      if (record.parentId === parent.id && record !== parent) out.push(record);
    }
  }
  return out;
}
