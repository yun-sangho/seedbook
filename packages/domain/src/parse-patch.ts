import { keyFields, type RecordDefinition, type RecordValues } from "./define-record";
import { type FieldSpec, type JsonShape, type NormalizeRule, UUID_PATTERN } from "./fields";

/** 필드 하나를 받지 않은 이유. */
export type RejectCode =
  | "type"
  | "null"
  | "min"
  | "max"
  | "length"
  | "pattern"
  | "enum"
  | "shape"
  | "required"
  | "immutable";

export interface Rejection {
  field: string;
  code: RejectCode;
}

export interface ParseOptions {
  /** `create` 는 기본값을 채우고 필수 필드를 확인한다. `patch` 는 받은 필드만 다룬다. */
  op: "create" | "patch";
  /**
   * 모르는 enum 값·json 안의 모르는 키를 어떻게 다루나.
   * - `strict` (기본): 거부·버림. 언제나 최신 정의를 가진 서버가 쓴다.
   * - `open`: open enum 의 모르는 값, json 의 모르는 키를 그대로 둔다. 옛 앱이 새 서버의 레코드를
   *   읽을 때 쓴다 (설계 §7.2).
   */
  enums?: "strict" | "open";
}

export interface ParseResult<V> {
  /** 받은 필드 (정리한 값). `create` 면 기본값까지 채운 전체. */
  patch: Partial<V>;
  /** 받지 않은 필드. 나머지 필드는 그대로 적용한다. */
  rejected: Rejection[];
}

/** 레코드 자체가 객체가 아닐 때의 `field`. */
export const WHOLE_RECORD = "*";

/**
 * 외부 입력을 레코드 패치로 검증한다 (설계 §3.4). 필드 단위로 거부하고 나머지는 적용한다.
 * 정의에 없는 필드는 무시한다. `default` 는 `create` 에만 채운다 — 패치에 채우면 옛 앱의 패치가
 * 모르는 새 필드를 덮는다 (§7.2).
 */
export function parsePatch<D extends RecordDefinition>(
  definition: D,
  raw: unknown,
  options: ParseOptions
): ParseResult<RecordValues<D>> {
  if (!isPlainObject(raw)) {
    return { patch: {}, rejected: [{ field: WHOLE_RECORD, code: "type" }] };
  }
  const enums = options.enums ?? "strict";
  const immutable = options.op === "patch" ? new Set(keyFields(definition)) : new Set<string>();
  const patch: Record<string, unknown> = {};
  const rejected: Rejection[] = [];

  for (const [name, field] of Object.entries(definition.fields)) {
    const value = raw[name];
    if (value === undefined) {
      if (options.op === "create") fillCreateValue(name, field.spec, patch, rejected);
      continue;
    }
    if (immutable.has(name)) {
      rejected.push({ field: name, code: "immutable" });
      continue;
    }
    const parsed = parseValue(field.spec, value, enums);
    if (parsed.ok) {
      patch[name] = parsed.value;
      continue;
    }
    rejected.push({ field: name, code: parsed.code });
    // 생성 때 잘못된 값은 기본값으로 채워 레코드를 완성한다 (거부한 값은 호출 쪽이 격리한다).
    if (options.op === "create" && field.spec.default) {
      patch[name] = structuredClone(field.spec.default.value);
    }
  }
  return { patch: patch as Partial<RecordValues<D>>, rejected };
}

function fillCreateValue(
  name: string,
  spec: FieldSpec,
  patch: Record<string, unknown>,
  rejected: Rejection[]
) {
  if (spec.default) patch[name] = structuredClone(spec.default.value);
  else rejected.push({ field: name, code: "required" });
}

type Parsed = { ok: true; value: unknown } | { ok: false; code: RejectCode };

const ok = (value: unknown): Parsed => ({ ok: true, value });
const fail = (code: RejectCode): Parsed => ({ ok: false, code });

/** 필드 값 하나를 정리·검증한다. json 모양 안의 필드에도 같은 규칙을 쓴다. */
export function parseValue(
  spec: FieldSpec,
  raw: unknown,
  enums: "strict" | "open" = "strict"
): Parsed {
  const value = applyNormalize(spec, raw);
  if (value === null || value === undefined) return spec.nullable ? ok(null) : fail("null");

  switch (spec.kind) {
    case "text":
      return parseText(spec, value);
    case "enum":
      return spec.list ? parseEnumList(spec, value, enums) : parseEnum(spec, value, enums);
    case "int":
      return Number.isSafeInteger(value) ? checkRange(spec, value as number) : fail("type");
    case "decimal":
      return isFiniteNumber(value) ? checkRange(spec, value) : fail("type");
    case "money":
      return Number.isSafeInteger(value) ? checkRange(spec, value as number) : fail("type");
    case "date":
      return isDate(value) ? ok(value) : fail("type");
    case "timestamp":
      return typeof value === "string" && !Number.isNaN(Date.parse(value))
        ? ok(value)
        : fail("type");
    case "uuidRef":
      return typeof value === "string" && UUID_PATTERN.test(value) ? ok(value) : fail("type");
    case "bool":
      return typeof value === "boolean" ? ok(value) : fail("type");
    case "json": {
      if (!spec.shape) return fail("shape");
      const parsed = parseShape(spec.shape, value, enums);
      return parsed.ok ? parsed : fail("shape");
    }
  }
}

function applyNormalize(spec: FieldSpec, raw: unknown): unknown {
  let value = raw;
  for (const rule of spec.normalize ?? []) value = NORMALIZERS[rule](value, spec);
  return value;
}

const NORMALIZERS: Record<NormalizeRule, (value: unknown, spec: FieldSpec) => unknown> = {
  finiteOrZero: (value) => (isFiniteNumber(value) ? value : 0),
  finiteOrNull: (value) => (isFiniteNumber(value) ? value : null),
  trunc: (value) => (isFiniteNumber(value) ? Math.trunc(value) : value),
  round: (value) => (isFiniteNumber(value) ? Math.round(value) : value),
  clamp: (value, spec) => {
    if (!isFiniteNumber(value)) return value;
    const low = spec.min ?? Number.NEGATIVE_INFINITY;
    const high = spec.max ?? Number.POSITIVE_INFINITY;
    return Math.min(high, Math.max(low, value));
  },
  trim: (value) => (typeof value === "string" ? value.trim() : value),
};

function parseText(spec: FieldSpec, value: unknown): Parsed {
  if (typeof value !== "string") return fail("type");
  if (spec.maxLength !== undefined && value.length > spec.maxLength) return fail("length");
  if (spec.pattern !== undefined && !new RegExp(spec.pattern).test(value)) return fail("pattern");
  return ok(value);
}

function acceptsEnumValue(spec: FieldSpec, value: string, enums: "strict" | "open"): boolean {
  return (spec.values ?? []).includes(value) || (enums === "open" && spec.open === true);
}

function parseEnum(spec: FieldSpec, value: unknown, enums: "strict" | "open"): Parsed {
  if (typeof value !== "string") return fail("type");
  return acceptsEnumValue(spec, value, enums) ? ok(value) : fail("enum");
}

/** 값의 목록: 중복은 합치고, 받을 수 없는 값은 목록에서 뺀다 (목록 자체는 거부하지 않는다). */
function parseEnumList(spec: FieldSpec, value: unknown, enums: "strict" | "open"): Parsed {
  if (!Array.isArray(value)) return fail("type");
  const kept = value.filter(
    (item): item is string => typeof item === "string" && acceptsEnumValue(spec, item, enums)
  );
  return ok([...new Set(kept)]);
}

function checkRange(spec: FieldSpec, value: number): Parsed {
  if (spec.min !== undefined && value < spec.min) return fail("min");
  if (spec.max !== undefined && value > spec.max) return fail("max");
  return ok(value);
}

function parseShape(shape: JsonShape, value: unknown, enums: "strict" | "open"): Parsed {
  if (shape.kind === "list") {
    if (!Array.isArray(value)) return fail("shape");
    if (shape.maxItems !== undefined && value.length > shape.maxItems) return fail("shape");
    const items: unknown[] = [];
    for (const item of value) {
      const parsed = isShape(shape.item)
        ? parseShape(shape.item, item, enums)
        : parseValue(shape.item, item, enums);
      if (!parsed.ok) return fail("shape");
      items.push(parsed.value);
    }
    return ok(items);
  }

  if (!isPlainObject(value)) return fail("shape");
  // open 이면 모르는 키를 그대로 둔다 (옛 앱이 새 모양의 값을 받았을 때).
  const result: Record<string, unknown> = enums === "open" ? { ...value } : {};
  for (const [name, spec] of Object.entries(shape.fields)) {
    if (value[name] === undefined) {
      if (!spec.default) return fail("shape");
      result[name] = structuredClone(spec.default.value);
      continue;
    }
    const parsed = parseValue(spec, value[name], enums);
    if (!parsed.ok) return fail("shape");
    result[name] = parsed.value;
  }
  return ok(result);
}

export function isShape(value: JsonShape | FieldSpec): value is JsonShape {
  return value.kind === "object" || value.kind === "list";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
