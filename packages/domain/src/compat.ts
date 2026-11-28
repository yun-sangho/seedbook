import type { FieldSpec, JsonShape } from "./fields";
import { isShape } from "./parse-patch";
import { type RecordSnapshot, type SchemaSnapshot, sameRecords, stableStringify } from "./snapshot";

/**
 * 정의 변경 하나. `extension` 은 옛 앱과 함께 동기화할 수 있는 변경, `breaking` 은 옛 앱을
 * `MIN_SCHEMA` 로 막아야 하는 변경이다 (설계 §7.4).
 */
export interface SchemaChange {
  kind: "extension" | "breaking";
  /** 예: `holding.quantity`, `rebalancing.result.holdings[].cash`. */
  path: string;
  message: string;
}

/** 이전 정의 → 다음 정의의 변경을 분류한다. */
export function classifyChanges(prev: SchemaSnapshot, next: SchemaSnapshot): SchemaChange[] {
  const changes: SchemaChange[] = [];
  for (const [type, before] of Object.entries(prev.records)) {
    const after = next.records[type];
    if (!after) changes.push(breaking(type, "레코드 타입 제거"));
    else compareRecord(type, before, after, changes);
  }
  for (const type of Object.keys(next.records)) {
    if (!prev.records[type]) changes.push(extension(type, "레코드 타입 추가"));
  }
  return changes;
}

const extension = (path: string, message: string): SchemaChange => ({
  kind: "extension",
  path,
  message,
});
const breaking = (path: string, message: string): SchemaChange => ({
  kind: "breaking",
  path,
  message,
});

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

function compareRecord(
  type: string,
  before: RecordSnapshot,
  after: RecordSnapshot,
  changes: SchemaChange[]
) {
  if (before.table !== after.table) changes.push(breaking(type, "서버 테이블 이름 변경"));
  if (!same(before.parent, after.parent)) changes.push(breaking(type, "부모 변경"));
  if (!same(before.key, after.key)) changes.push(breaking(type, "키 변경"));
  if (before.sortable && !after.sortable) changes.push(breaking(type, "sortKey 제거"));
  if (!before.sortable && after.sortable) changes.push(extension(type, "sortKey 추가"));
  compareFields(type, before.fields, after.fields, changes);
}

function compareFields(
  path: string,
  before: Record<string, FieldSpec>,
  after: Record<string, FieldSpec>,
  changes: SchemaChange[]
) {
  for (const [name, spec] of Object.entries(before)) {
    const next = after[name];
    if (!next) changes.push(breaking(`${path}.${name}`, "필드 제거"));
    else compareField(`${path}.${name}`, spec, next, changes);
  }
  for (const [name, spec] of Object.entries(after)) {
    if (before[name]) continue;
    changes.push(
      spec.default
        ? extension(`${path}.${name}`, "필드 추가 (기본값 있음)")
        : breaking(`${path}.${name}`, "기본값 없는 필드 추가 — 옛 앱이 만든 레코드가 무효가 된다")
    );
  }
}

/** 값을 고쳐 받을 수 있으면 (`clamp`) 범위를 좁혀도 확장이다. */
const clamps = (spec: FieldSpec) => spec.normalize?.includes("clamp") === true;

function compareField(path: string, before: FieldSpec, after: FieldSpec, changes: SchemaChange[]) {
  const push = (kind: SchemaChange["kind"], message: string) =>
    changes.push({ kind, path, message });

  if (before.kind !== after.kind) {
    push("breaking", `타입 변경 (${before.kind} → ${after.kind}) — 새 필드로 추가한다`);
    return;
  }
  if (before.nullable && !after.nullable) push("breaking", "null 금지로 변경");
  if (!before.nullable && after.nullable) push("extension", "null 허용");

  if (before.default && !after.default) push("breaking", "기본값 제거");
  if (!before.default && after.default) push("extension", "기본값 추가");
  if (before.default && after.default && !same(before.default, after.default)) {
    push("extension", "기본값 변경 (새로 만드는 레코드에만 적용)");
  }

  const removedRules = (before.normalize ?? []).filter((r) => !after.normalize?.includes(r));
  const addedRules = (after.normalize ?? []).filter((r) => !before.normalize?.includes(r));
  if (removedRules.length) push("breaking", `정리 규칙 제거 (${removedRules.join(", ")})`);
  if (addedRules.length) push("extension", `정리 규칙 추가 (${addedRules.join(", ")})`);

  compareBound(push, "min", before.min, after.min, (b, a) => a > b, clamps(after));
  compareBound(push, "max", before.max, after.max, (b, a) => a < b, clamps(after));
  compareBound(push, "maxLength", before.maxLength, after.maxLength, (b, a) => a < b, false);
  if (before.pattern !== after.pattern) {
    push(after.pattern === undefined ? "extension" : "breaking", "pattern 변경");
  }

  if (before.kind === "enum") compareEnum(push, before, after);
  if (before.deprecated !== after.deprecated) {
    push("extension", after.deprecated ? "deprecated 표시" : "deprecated 해제");
  }
  if (before.shape && after.shape) compareShape(path, before.shape, after.shape, changes);
}

function compareBound(
  push: (kind: SchemaChange["kind"], message: string) => void,
  name: string,
  before: number | undefined,
  after: number | undefined,
  tighter: (before: number, after: number) => boolean,
  fixable: boolean
) {
  if (before === after) return;
  const tightened = after !== undefined && (before === undefined || tighter(before, after));
  if (!tightened) push("extension", `${name} 완화 (${before} → ${after})`);
  else if (fixable) push("extension", `${name} 강화 (${before} → ${after}), clamp 로 고쳐 받음`);
  else push("breaking", `${name} 강화 (${before} → ${after}) — 옛 앱이 만든 값이 거부된다`);
}

function compareEnum(
  push: (kind: SchemaChange["kind"], message: string) => void,
  before: FieldSpec,
  after: FieldSpec
) {
  if (Boolean(before.list) !== Boolean(after.list)) push("breaking", "값 ↔ 값의 목록 변경");
  if (before.open && !after.open) push("breaking", "open enum 을 닫음");
  if (!before.open && after.open) push("extension", "enum 을 open 으로");
  const removed = (before.values ?? []).filter((v) => !after.values?.includes(v));
  const added = (after.values ?? []).filter((v) => !before.values?.includes(v));
  if (removed.length) push("breaking", `enum 값 제거 (${removed.join(", ")})`);
  if (added.length) {
    // open 이 아닌 enum 은 옛 앱이 새 값을 받지 못한다.
    push(before.open ? "extension" : "breaking", `enum 값 추가 (${added.join(", ")})`);
  }
}

function compareShape(path: string, before: JsonShape, after: JsonShape, changes: SchemaChange[]) {
  if (before.kind !== after.kind) {
    changes.push(breaking(path, `json 모양 변경 (${before.kind} → ${after.kind})`));
    return;
  }
  if (before.kind === "object" && after.kind === "object") {
    compareFields(path, before.fields, after.fields, changes);
    return;
  }
  if (before.kind === "list" && after.kind === "list") {
    const itemPath = `${path}[]`;
    const tightened =
      after.maxItems !== undefined &&
      (before.maxItems === undefined || after.maxItems < before.maxItems);
    if (before.maxItems !== after.maxItems) {
      changes.push(
        tightened
          ? breaking(itemPath, `maxItems 강화 (${before.maxItems} → ${after.maxItems})`)
          : extension(itemPath, `maxItems 완화 (${before.maxItems} → ${after.maxItems})`)
      );
    }
    if (isShape(before.item) && isShape(after.item)) {
      compareShape(itemPath, before.item, after.item, changes);
    } else if (!isShape(before.item) && !isShape(after.item)) {
      compareField(itemPath, before.item, after.item, changes);
    } else {
      changes.push(breaking(itemPath, "목록 항목 모양 변경"));
    }
  }
}

export interface SchemaCheckResult {
  errors: string[];
  /** 가장 최근 출시 스냅샷 대비 변경 (참고용). */
  changes: SchemaChange[];
}

/**
 * 현재 정의를 출시 스냅샷들과 비교한다 (`pnpm schema:check`, 설계 §7.5).
 *
 * - 스냅샷이 없으면 (출시 전) 버전 값만 확인한다.
 * - 최근 스냅샷과 정의가 다른데 `SCHEMA_VERSION` 이 그대로면 실패.
 * - 지원 구간 `[MIN_SCHEMA, CURRENT]` 의 모든 스냅샷과 비교해 깨는 변경이 있으면 실패 —
 *   `MIN_SCHEMA` 를 그 스냅샷보다 크게 올려 옛 앱을 막아야 한다.
 */
export function checkSchema(
  current: SchemaSnapshot,
  released: readonly SchemaSnapshot[]
): SchemaCheckResult {
  const errors: string[] = [];
  const { schemaVersion, minSchema } = current;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    errors.push(`SCHEMA_VERSION 은 1 이상의 정수여야 한다 (지금 ${schemaVersion})`);
  }
  if (!Number.isInteger(minSchema) || minSchema < 1 || minSchema > schemaVersion) {
    errors.push(`MIN_SCHEMA 는 1 이상 SCHEMA_VERSION 이하의 정수여야 한다 (지금 ${minSchema})`);
  }

  const snapshots = [...released].sort((a, b) => a.schemaVersion - b.schemaVersion);
  const latest = snapshots.at(-1);
  if (!latest) return { errors, changes: [] };

  if (schemaVersion < latest.schemaVersion) {
    errors.push(
      `SCHEMA_VERSION ${schemaVersion} 이 출시 스냅샷 v${latest.schemaVersion} 보다 낮다`
    );
  }
  if (minSchema < latest.minSchema) {
    errors.push(`MIN_SCHEMA 는 내릴 수 없다 (v${latest.schemaVersion}: ${latest.minSchema})`);
  }
  const changes = classifyChanges(latest, current);
  if (schemaVersion === latest.schemaVersion && !sameRecords(latest, current)) {
    errors.push(
      `레코드 정의가 출시 스냅샷 v${latest.schemaVersion} 과 다르다 — SCHEMA_VERSION 을 올린다`
    );
  }

  for (const snapshot of snapshots) {
    if (snapshot.schemaVersion < minSchema) continue;
    const broken = classifyChanges(snapshot, current).filter((c) => c.kind === "breaking");
    if (broken.length === 0) continue;
    errors.push(
      [
        `v${snapshot.schemaVersion} 앱과 호환되지 않는 변경 — 확장으로 바꾸거나, 깨는 변경이면 ` +
          `MIN_SCHEMA 를 ${snapshot.schemaVersion + 1} 이상으로 올리고 up 단계를 함께 둔다:`,
        ...broken.map((c) => `  - ${c.path}: ${c.message}`),
      ].join("\n")
    );
  }
  return { errors, changes };
}
