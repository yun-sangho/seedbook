import {
  account,
  accountRecord,
  allocation,
  cash,
  harvest,
  holding,
  portfolio,
  type RecordDefinition,
  rebalancing,
  rebalancingTask,
} from "@seedbook/domain";

/**
 * 동기화 v2 클라이언트의 레코드 모델 (설계 §5.1). 프레임워크·저장소와 무관한 순수 타입·함수만 둔다 —
 * Vite SPA 로 옮길 때 `lib/sync/v2` 를 그대로 가져간다.
 *
 * 기기에 두는 레코드는 **서버가 준 레코드를 통째로** 담는다 (`fields` 에 정의에 없는 필드도 남는다,
 * 설계 §7.2). 화면 store 가 아는 필드는 정의의 필드뿐이고, 저장은 `{...기존, ...아는 필드}` 다.
 */

/** 기기에 저장한 레코드 하나. */
export interface LocalRecord {
  type: string;
  id: string;
  parentId: string | null;
  sortKey: string | null;
  /** 정의의 필드 + 정의에 없는 필드(서버의 새 필드, 기기 전용 옛 필드). */
  fields: Record<string, unknown>;
}

/** `type:id` → 레코드. */
export type RecordMap = Map<string, LocalRecord>;

export const recordKey = (type: string, id: string) => `${type}:${id}`;

/**
 * 동기화하는 레코드 타입 (설계 §2.1). push 순서이기도 하다 — 부모가 하위보다 먼저 오고, 계좌의
 * `portfolioId` 가 가리키는 포트폴리오가 계좌보다 먼저 온다 (서버 외래 키).
 * 계정 화면 설정(`settings`)은 `/api/me/preferences` 가 저장소 모드와 상관없이 맡아 여기서 다루지 않는다.
 */
export const SYNCED_DEFINITIONS: readonly RecordDefinition[] = [
  portfolio,
  allocation,
  account,
  holding,
  cash,
  accountRecord,
  rebalancing,
  rebalancingTask,
  harvest,
];

const DEFINITIONS = new Map(SYNCED_DEFINITIONS.map((d) => [d.type, d]));

export const SYNCED_TYPES: readonly string[] = SYNCED_DEFINITIONS.map((d) => d.type);

export function definitionOf(type: string): RecordDefinition | null {
  return DEFINITIONS.get(type) ?? null;
}

/** push 순서 — 부모 타입이 먼저. 모르는 타입은 맨 뒤. */
export function typeRank(type: string): number {
  const index = SYNCED_TYPES.indexOf(type);
  return index === -1 ? SYNCED_TYPES.length : index;
}

/** 정의가 아는 필드만 (패치·비교 대상). */
export function knownFields(
  type: string,
  fields: Record<string, unknown>
): Record<string, unknown> {
  const definition = definitionOf(type);
  if (!definition) return {};
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(definition.fields)) {
    if (fields[name] !== undefined) out[name] = fields[name];
  }
  return out;
}

/** 정의에 없는 필드 (기기에만 두는 값, 앱이 모르는 서버 필드). */
export function otherFields(
  type: string,
  fields: Record<string, unknown>
): Record<string, unknown> {
  const definition = definitionOf(type);
  if (!definition) return { ...fields };
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (!(name in definition.fields) && value !== undefined) out[name] = value;
  }
  return out;
}

/** JSON 값 비교 (키 순서 무관). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((item, i) => sameValue(item, other[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] === undefined && right[key] === undefined) continue;
    if (!sameValue(left[key], right[key])) return false;
  }
  return true;
}

/** `next` 가 `base` 와 다른 아는 필드만 (패치). */
export function changedKnownFields(
  type: string,
  base: Record<string, unknown> | null,
  next: Record<string, unknown>
): Record<string, unknown> {
  const known = knownFields(type, next);
  if (!base) return known;
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(known)) {
    if (!sameValue(value, base[name])) out[name] = value;
  }
  return out;
}

export function isSortable(type: string): boolean {
  return definitionOf(type)?.sortable ?? false;
}
