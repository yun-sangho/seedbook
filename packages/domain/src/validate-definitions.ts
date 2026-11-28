import type { RecordDefinition } from "./define-record";
import type { FieldSpec, JsonShape } from "./fields";
import { isShape, parseValue } from "./parse-patch";

/** 공통 열 이름 — 필드로 정의하지 않는다 (설계 §2.2). */
export const COMMON_COLUMNS = [
  "id",
  "userId",
  "version",
  "changeSeq",
  "deletedAt",
  "createdAt",
  "updatedAt",
  "sortKey",
] as const;

/** 정의 자체의 실수를 찾는다 (스냅샷·호환 검사 전에). 문제가 없으면 빈 배열. */
export function validateDefinitions(records: readonly RecordDefinition[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const tables = new Set<string>();

  for (const definition of records) {
    const { type } = definition;
    if (seen.has(type)) errors.push(`${type}: 레코드 타입 중복`);
    if (tables.has(definition.table)) errors.push(`${type}: 서버 테이블 ${definition.table} 중복`);
    if (definition.parent && !seen.has(definition.parent.type)) {
      errors.push(`${type}: 부모 ${definition.parent.type} 가 목록에서 먼저 정의되지 않음`);
    }
    if (definition.key.kind === "derived") {
      if (!definition.parent) errors.push(`${type}: derived 키는 부모가 있어야 한다`);
      const keySpec = definition.fields[definition.key.name]?.spec;
      if (!keySpec || keySpec.nullable || !["text", "date"].includes(keySpec.kind)) {
        errors.push(`${type}: 키 필드 ${definition.key.name} 는 null 이 아닌 text·date 여야 한다`);
      }
    }
    if (definition.key.kind === "singleton" && (definition.parent || definition.sortable)) {
      errors.push(`${type}: singleton 은 부모·sortKey 가 없다`);
    }
    for (const [name, field] of Object.entries(definition.fields)) {
      const path = `${type}.${name}`;
      if ((COMMON_COLUMNS as readonly string[]).includes(name)) {
        errors.push(`${path}: 공통 열 이름은 필드로 쓸 수 없다`);
      }
      if (definition.parent?.column === name) errors.push(`${path}: 부모 id 컬럼과 겹침`);
      validateSpec(path, field.spec, errors);
    }
    seen.add(type);
    tables.add(definition.table);
  }
  return errors;
}

function validateSpec(path: string, spec: FieldSpec, errors: string[]) {
  if (spec.default) {
    const parsed = parseValue(spec, spec.default.value);
    if (!parsed.ok) errors.push(`${path}: 기본값이 자기 검증을 통과하지 못함 (${parsed.code})`);
  }
  if (spec.kind === "enum") {
    const values = spec.values ?? [];
    if (values.length === 0) errors.push(`${path}: enum 값이 없다`);
    if (new Set(values).size !== values.length) errors.push(`${path}: enum 값 중복`);
  }
  if (spec.normalize?.includes("clamp") && spec.min === undefined && spec.max === undefined) {
    errors.push(`${path}: clamp 에는 min 이나 max 가 필요하다`);
  }
  if (spec.kind === "json" && !spec.shape) errors.push(`${path}: json 필드에 모양이 없다`);
  if (spec.shape) validateShape(path, spec.shape, errors);
}

function validateShape(path: string, shape: JsonShape, errors: string[]) {
  if (shape.kind === "list") {
    if (isShape(shape.item)) validateShape(`${path}[]`, shape.item, errors);
    else validateSpec(`${path}[]`, shape.item, errors);
    return;
  }
  for (const [name, spec] of Object.entries(shape.fields)) {
    validateSpec(`${path}.${name}`, spec, errors);
  }
}
