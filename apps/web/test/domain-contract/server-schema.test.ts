// @vitest-environment node
import { schema } from "@seedbook/database";
import {
  COMMON_COLUMNS,
  type FieldSpec,
  fieldSpecs,
  type JsonValue,
  RECORDS,
  type RecordDefinition,
} from "@seedbook/domain";
import { is } from "drizzle-orm";
import { getTableConfig, type PgColumn, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { LEGACY_SERVER_COLUMNS, PLANNED_SERVER_COLUMNS, PLANNED_SERVER_TABLES } from "./exceptions";

/**
 * 레코드 정의 ↔ 서버 drizzle 스키마 (`packages/database/src/schema.ts`). drizzle 스키마는 마이그레이션
 * 생성 규칙 때문에 손으로 두고, 정의와 컬럼·타입·nullable·기본값이 같은지 여기서 막는다 (설계 §3.4).
 */

const TABLES = new Map<string, PgTable>(
  Object.values(schema)
    .filter((value): value is Extract<typeof value, PgTable> => is(value, PgTable))
    .map((table) => [getTableConfig(table).name, table])
);

/** 필드 종류 → 받는 drizzle 컬럼 타입. */
const COLUMN_TYPES: Record<FieldSpec["kind"], string[]> = {
  text: ["PgText"],
  enum: ["PgText"],
  int: ["PgInteger"],
  decimal: ["PgDoublePrecision"],
  money: ["PgBigInt64", "PgBigInt53"],
  date: ["PgDate", "PgDateString"],
  timestamp: ["PgTimestamp", "PgTimestampString"],
  uuidRef: ["PgUUID"],
  bool: ["PgBoolean"],
  json: ["PgJsonb"],
};

function columnType(column: PgColumn): string {
  if (column.columnType === "PgArray") {
    const base = (column as PgColumn & { baseColumn: PgColumn }).baseColumn;
    return `${base.columnType}[]`;
  }
  return column.columnType;
}

function expectedColumnTypes(spec: FieldSpec): string[] {
  const types = COLUMN_TYPES[spec.kind];
  return spec.list ? types.map((t) => `${t}[]`) : types;
}

/** 컬럼 기본값을 JSON 값으로. `ARRAY[]::text[]` 같은 SQL 기본값은 빈 배열. 없으면 undefined. */
function columnDefault(column: PgColumn): JsonValue | undefined {
  const value = column.default as unknown;
  if (value === undefined) return undefined;
  if (value && typeof value === "object" && "queryChunks" in value) {
    const chunks = (value as { queryChunks: Array<{ value?: string[] }> }).queryChunks;
    const text = chunks.flatMap((c) => c.value ?? []).join("");
    if (/^ARRAY\[\]::\w+\[\]$/.test(text)) return [];
    throw new Error(`${column.name}: 알 수 없는 SQL 기본값 ${text}`);
  }
  return value as JsonValue;
}

/** 공통 열 (설계 §2.2) + 부모 id 컬럼 + 필드. singleton 은 id 대신 userId 가 키다. */
function expectedServerColumns(definition: RecordDefinition): string[] {
  const common = COMMON_COLUMNS.filter(
    (c) =>
      !(definition.key.kind === "singleton" && c === "id") &&
      !(!definition.sortable && c === "sortKey")
  );
  return [
    ...common,
    ...(definition.parent ? [definition.parent.column] : []),
    ...Object.keys(definition.fields),
  ];
}

const builtRecords = RECORDS.filter((r) => !PLANNED_SERVER_TABLES[r.type]);

describe("record definitions ↔ server schema", () => {
  it.each(RECORDS.map((r) => [r.type, r] as const))("%s has a server table", (type, definition) => {
    const planned = PLANNED_SERVER_TABLES[type];
    // 예정인 테이블이 생기면 PLANNED_SERVER_TABLES 에서 지운다.
    expect(TABLES.has(definition.table)).toBe(!planned);
  });

  it.each(builtRecords.map((r) => [r.type, r] as const))(
    "%s has exactly the expected columns (except planned and legacy ones)",
    (type, definition) => {
      const table = TABLES.get(definition.table) as PgTable;
      const actual = getTableConfig(table).columns.map((c) => c.name);
      const planned = Object.keys(PLANNED_SERVER_COLUMNS[type] ?? {});
      const legacy = Object.keys(LEGACY_SERVER_COLUMNS[type] ?? {});
      const expected = expectedServerColumns(definition);

      const missing = expected.filter((c) => !actual.includes(c) && !planned.includes(c));
      const unexpected = actual.filter((c) => !expected.includes(c) && !legacy.includes(c));
      const plannedButPresent = planned.filter((c) => actual.includes(c));
      const staleLegacy = legacy.filter((c) => !actual.includes(c));

      expect({ missing, unexpected, plannedButPresent, staleLegacy }).toEqual({
        missing: [],
        unexpected: [],
        plannedButPresent: [],
        staleLegacy: [],
      });
    }
  );

  describe.each(builtRecords.map((r) => [r.type, r] as const))("%s fields", (_, definition) => {
    const columns = new Map(
      getTableConfig(TABLES.get(definition.table) as PgTable).columns.map((c) => [c.name, c])
    );

    it.each(Object.entries(fieldSpecs(definition)))("%s matches its column", (name, spec) => {
      const column = columns.get(name) as PgColumn;
      expect(expectedColumnTypes(spec)).toContain(columnType(column));
      expect(column.notNull).toBe(!spec.nullable);
      // 컬럼 기본값이 있으면 정의의 생성 기본값과 같아야 한다 (서버·기기 어디서 만들어도 같은 값).
      const dbDefault = columnDefault(column);
      if (dbDefault !== undefined) expect(spec.default?.value).toEqual(dbDefault);
      const dbEnum = (column as PgColumn & { enumValues?: string[] }).enumValues;
      if (dbEnum?.length) expect([...dbEnum].sort()).toEqual([...(spec.values ?? [])].sort());
    });
  });

  it.each(builtRecords.filter((r) => r.parent).map((r) => [r.type, r] as const))(
    "%s parent column references the parent table",
    (_, definition) => {
      const parent = RECORDS.find((r) => r.type === definition.parent?.type) as RecordDefinition;
      const config = getTableConfig(TABLES.get(definition.table) as PgTable);
      const references = config.foreignKeys.map((fk) => {
        const ref = fk.reference();
        return {
          columns: ref.columns.map((c) => c.name),
          table: getTableConfig(ref.foreignTable).name,
        };
      });

      expect(references).toContainEqual({
        columns: [definition.parent?.column],
        table: parent.table,
      });
    }
  );
});
