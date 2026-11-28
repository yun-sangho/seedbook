import {
  fieldSpecs,
  type RecordDefinition,
  type RecordKey,
  type RecordParent,
} from "./define-record";
import type { FieldSpec } from "./fields";

export const SNAPSHOT_FORMAT = "seedbook-domain-schema";

export interface RecordSnapshot {
  table: string;
  parent: RecordParent | null;
  key: RecordKey;
  sortable: boolean;
  fields: Record<string, FieldSpec>;
}

/**
 * 출시한 버전의 레코드 정의 (`schema-snapshots/v<N>.json`). 정의에서 기계로 만들고, 만든 뒤에는
 * 고치거나 지우지 않는다 — 옛 앱이 이 모양으로 서버와 동기화한다 (설계 §7.5).
 */
export interface SchemaSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  schemaVersion: number;
  minSchema: number;
  records: Record<string, RecordSnapshot>;
}

export function createSnapshot(
  records: readonly RecordDefinition[],
  versions: { schemaVersion: number; minSchema: number }
): SchemaSnapshot {
  const described: Record<string, RecordSnapshot> = {};
  for (const definition of records) {
    described[definition.type] = {
      table: definition.table,
      parent: definition.parent,
      key: definition.key,
      sortable: definition.sortable,
      fields: fieldSpecs(definition),
    };
  }
  // JSON 왕복으로 undefined 키를 없애 파일에서 읽은 스냅샷과 같은 모양으로 맞춘다.
  return JSON.parse(
    JSON.stringify({
      format: SNAPSHOT_FORMAT,
      schemaVersion: versions.schemaVersion,
      minSchema: versions.minSchema,
      records: described,
    })
  );
}

/** 키 순서와 상관없이 같은 JSON 문자열 (파일 저장·비교용). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** 버전 번호를 뺀 레코드 정의가 같은지. */
export function sameRecords(a: SchemaSnapshot, b: SchemaSnapshot): boolean {
  return stableStringify(a.records) === stableStringify(b.records);
}
