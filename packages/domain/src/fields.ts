/**
 * 레코드 필드 정의 (DSL). 필드 하나는 `spec` (스냅샷·호환 검사가 읽는 순수 데이터) 과
 * TS 타입 (`FieldValue<F>`, 컴파일 때만) 을 함께 갖는다.
 *
 * 규칙 (설계 §3.2·§3.3):
 * - `default` 는 **생성 때만** 쓴다. 패치에는 절대 채우지 않는다. 기본값이 없는 필드는 생성 때 필수다.
 * - `normalize` 는 받은 값을 고쳐 쓰는 규칙이다. 고칠 수 있으면 거부하지 않는다. 검증보다 먼저 돈다.
 * - enum 은 기본이 open 이다 — 값 추가가 확장이고, 옛 앱은 모르는 값을 지우지 않고 보관한다
 *   (`parsePatch` 의 `enums: "open"`).
 */

export type FieldKind =
  | "text"
  | "enum"
  | "int"
  | "decimal"
  | "money"
  | "date"
  | "timestamp"
  | "uuidRef"
  | "bool"
  | "json";

/**
 * 값 정리 규칙. 적은 순서대로 돈다.
 * - `finiteOrZero`: 유한한 숫자가 아니면 (NaN·Infinity·null) 0
 * - `finiteOrNull`: 유한한 숫자가 아니면 null
 * - `trunc` / `round`: 숫자를 정수로 (원 단위 금액)
 * - `clamp`: 숫자를 `min`·`max` 안으로
 * - `trim`: 문자열 앞뒤 공백 제거
 */
export type NormalizeRule = "finiteOrZero" | "finiteOrNull" | "trunc" | "round" | "clamp" | "trim";

/** json 필드의 내부 모양. 통째 값이라 패치 단위는 필드 전체다. */
export type JsonShape =
  | { kind: "object"; fields: Record<string, FieldSpec> }
  | { kind: "list"; item: JsonShape | FieldSpec; maxItems?: number };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** 필드 하나의 정의. 순수 JSON 이라 그대로 스냅샷에 들어간다. */
export interface FieldSpec {
  kind: FieldKind;
  nullable: boolean;
  /** 생성 때 값이 없으면 쓸 값. 없으면 생성 때 필수. */
  default?: { value: JsonValue };
  normalize?: NormalizeRule[];
  /** 숫자의 하한·상한 (포함). */
  min?: number;
  max?: number;
  /** 문자열 길이 상한. */
  maxLength?: number;
  /** 문자열 정규식 (`RegExp` source). */
  pattern?: string;
  /** enum 값 목록. */
  values?: string[];
  /** enum 이 모르는 값을 받아도 되는지 (값 추가 = 확장). */
  open?: boolean;
  /** enum 값의 목록 (중복 없음). */
  list?: boolean;
  /** json 필드의 모양. */
  shape?: JsonShape;
  /** 정리 예정. 읽기는 계속 지원, 새 코드에서 쓰지 않는다. */
  deprecated?: boolean;
}

declare const valueType: unique symbol;

/** 정의된 필드. `[valueType]` 은 타입 추론용이며 런타임 값은 없다. */
export interface Field<T> {
  readonly spec: FieldSpec;
  readonly [valueType]?: T;
}

export type FieldValue<F> = F extends Field<infer T> ? T : never;

type Nullable<N, T> = N extends true ? T | null : T;

interface BaseOptions<T, N extends boolean> {
  nullable?: N;
  default?: Nullable<N, T>;
  normalize?: NormalizeRule[];
  deprecated?: boolean;
}

interface NumberOptions<N extends boolean> extends BaseOptions<number, N> {
  min?: number;
  max?: number;
}

interface TextOptions<N extends boolean> extends BaseOptions<string, N> {
  maxLength?: number;
  pattern?: RegExp;
}

function build<T>(kind: FieldKind, options: object, extra: Partial<FieldSpec> = {}): Field<T> {
  const {
    nullable,
    default: defaultValue,
    pattern,
    ...rest
  } = options as BaseOptions<unknown, boolean> & { pattern?: RegExp };
  const spec: FieldSpec = {
    kind,
    nullable: nullable === true,
    ...rest,
    ...(pattern ? { pattern: pattern.source } : {}),
    ...(defaultValue !== undefined ? { default: { value: defaultValue as JsonValue } } : {}),
    ...extra,
  };
  return { spec };
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 객체 모양 (json 필드 안에서만). */
type ShapeFields = Record<string, Field<unknown>>;
type ObjectOf<S extends ShapeFields> = { [K in keyof S]: FieldValue<S[K]> };

/** json 모양 정의. */
export interface Shape<T> {
  readonly shape: JsonShape;
  readonly [valueType]?: T;
}

export const shape = {
  object<S extends ShapeFields>(fields: S): Shape<ObjectOf<S>> {
    const specs: Record<string, FieldSpec> = {};
    for (const [name, field] of Object.entries(fields)) specs[name] = field.spec;
    return { shape: { kind: "object", fields: specs } };
  },
  list<T>(item: Shape<T> | Field<T>, options: { maxItems?: number } = {}): Shape<T[]> {
    return {
      shape: { kind: "list", item: "shape" in item ? item.shape : item.spec, ...options },
    };
  },
};

export const f = {
  text<N extends boolean = false>(options: TextOptions<N> = {}) {
    return build<Nullable<N, string>>("text", options);
  },
  /** 값 목록 중 하나. 기본 open. `list: true` 면 값의 목록 (중복·모르는 값은 정리). */
  enum<const V extends readonly string[], N extends boolean = false>(
    values: V,
    options: BaseOptions<V[number], N> & { open?: boolean } = {}
  ) {
    const { open = true, ...rest } = options;
    return build<Nullable<N, V[number]>>("enum", rest, { values: [...values], open });
  },
  enumList<const V extends readonly string[]>(
    values: V,
    options: Omit<BaseOptions<V[number][], false>, "nullable"> & { open?: boolean } = {}
  ) {
    const { open = true, ...rest } = options;
    return build<V[number][]>("enum", rest, { values: [...values], open, list: true });
  },
  int<N extends boolean = false>(options: NumberOptions<N> = {}) {
    return build<Nullable<N, number>>("int", options);
  },
  /** 유한한 실수. */
  decimal<N extends boolean = false>(options: NumberOptions<N> = {}) {
    return build<Nullable<N, number>>("decimal", options);
  },
  /** 원 단위 정수 금액 (서버 bigint ↔ 클라이언트 number, safe integer). */
  money<N extends boolean = false>(options: NumberOptions<N> = {}) {
    return build<Nullable<N, number>>("money", options);
  },
  /** `YYYY-MM-DD`. */
  date<N extends boolean = false>(options: BaseOptions<string, N> = {}) {
    return build<Nullable<N, string>>("date", options);
  },
  /** ISO 8601 시각. */
  timestamp<N extends boolean = false>(options: BaseOptions<string, N> = {}) {
    return build<Nullable<N, string>>("timestamp", options);
  },
  /** 다른 레코드의 uuid. 가리키는 레코드가 없어도 된다. */
  uuidRef<N extends boolean = false>(options: BaseOptions<string, N> = {}) {
    return build<Nullable<N, string>>("uuidRef", options);
  },
  bool<N extends boolean = false>(options: BaseOptions<boolean, N> = {}) {
    return build<Nullable<N, boolean>>("bool", options);
  },
  /** 통째 값 (LWW). 모양은 `shape` 로 검증한다. */
  json<T, N extends boolean = false>(of: Shape<T>, options: BaseOptions<T, N> = {}) {
    return build<Nullable<N, T>>("json", options, { shape: of.shape });
  },
};
