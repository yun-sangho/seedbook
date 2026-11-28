import type { Field, FieldSpec, FieldValue } from "./fields";
import { uuidv5 } from "./uuid-v5";

/**
 * 레코드 키.
 * - `uuid`: 클라이언트가 만든 uuid.
 * - `derived`: 부모 id 를 namespace 로, 정한 필드 값을 name 으로 한 uuidv5 (`deriveRecordId`).
 *   같은 부모·같은 값이면 두 기기가 따로 만들어도 같은 id 로 수렴한다. 키를 만드는 필드는 생성 때만
 *   정하고 패치로 바꾸지 않는다.
 * - `singleton`: 사용자당 하나. id = userId.
 */
export type RecordKey =
  | { kind: "uuid" }
  | { kind: "derived"; namespace: "parent"; name: string }
  | { kind: "singleton" };

export interface RecordParent {
  /** 부모 레코드 타입. */
  type: string;
  /** 서버 테이블의 부모 id 컬럼. */
  column: string;
  /** 부모를 지우면 서버가 같은 트랜잭션에서 하위 레코드에 톰스톤을 찍는다. */
  onParentDelete: "tombstone";
}

export type RecordFields = Record<string, Field<unknown>>;

export interface RecordDefinition<
  F extends RecordFields = RecordFields,
  T extends string = string,
> {
  /** 레코드 타입 이름 (동기화 프로토콜의 `type`). */
  type: T;
  /** 서버 테이블. */
  table: string;
  parent: RecordParent | null;
  key: RecordKey;
  /** 목록 순서 `sortKey` (분수 인덱스) 를 갖는지. */
  sortable: boolean;
  fields: F;
}

/** 레코드의 필드 값 (공통 열 제외). */
export type RecordValues<D> =
  D extends RecordDefinition<infer F, string>
    ? { -readonly [K in keyof F]: FieldValue<F[K]> }
    : never;

export function defineRecord<const T extends string, const F extends RecordFields>(definition: {
  type: T;
  table: string;
  parent?: RecordParent;
  key: RecordKey;
  sortable?: boolean;
  fields: F;
}): RecordDefinition<F, T> {
  return {
    type: definition.type,
    table: definition.table,
    parent: definition.parent ?? null,
    key: definition.key,
    sortable: definition.sortable ?? false,
    fields: definition.fields,
  };
}

export function fieldSpecs(definition: RecordDefinition): Record<string, FieldSpec> {
  const specs: Record<string, FieldSpec> = {};
  for (const [name, field] of Object.entries(definition.fields)) specs[name] = field.spec;
  return specs;
}

/** 키를 만드는 필드 — 생성 때만 정하고 패치로 바꾸지 않는다. */
export function keyFields(definition: RecordDefinition): string[] {
  return definition.key.kind === "derived" ? [definition.key.name] : [];
}

/**
 * 레코드 id. `derived` 키는 uuidv5(부모 id, 키 필드 값), `singleton` 은 사용자 id 다.
 * `uuid` 키는 만든 쪽이 정하므로 여기서 만들지 않는다.
 */
export function deriveRecordId(
  definition: RecordDefinition,
  input: { parentId?: string; userId?: string; fields: Record<string, unknown> }
): string {
  const { key } = definition;
  if (key.kind === "singleton") {
    if (!input.userId) throw new Error(`${definition.type}: singleton id needs userId`);
    return input.userId;
  }
  if (key.kind === "uuid")
    throw new Error(`${definition.type}: uuid keys are chosen by the client`);
  const name = input.fields[key.name];
  if (!input.parentId || typeof name !== "string") {
    throw new Error(`${definition.type}: derived id needs parentId and ${key.name}`);
  }
  return uuidv5(input.parentId, name);
}
