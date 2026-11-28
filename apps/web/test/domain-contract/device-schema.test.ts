// @vitest-environment node
import { type FieldSpec, fieldSpecs, type JsonValue, RECORDS } from "@seedbook/domain";
import { migrateDeviceDatabase } from "@web/lib/native/device-db/migrations";
import { createNodeSqliteDriver } from "@web/lib/native/device-db/testing/node-sqlite-driver";
import { beforeAll, describe, expect, it } from "vitest";
import { DEVICE_COMMON_COLUMNS, LEGACY_DEVICE_COLUMNS, PLANNED_DEVICE_TABLES } from "./exceptions";

/**
 * 레코드 정의 ↔ 기기 SQLite (`lib/native/device-db/migrations.ts`). v2-4a 에서 기기가 레코드 JSON
 * 테이블 하나로 바뀌기 전까지 지금 표의 컬럼·타입·NOT NULL·기본값을 대조한다.
 */

interface DeviceColumn {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
}

/** 필드 종류 → SQLite 컬럼 타입 (`migrations.ts` 의 타입 대응). */
const SQLITE_TYPES: Record<FieldSpec["kind"], string> = {
  text: "TEXT",
  enum: "TEXT",
  int: "INTEGER",
  decimal: "REAL",
  money: "INTEGER",
  date: "TEXT",
  timestamp: "TEXT",
  uuidRef: "TEXT",
  bool: "INTEGER",
  json: "TEXT",
};

/** 목록·json 은 JSON 문자열로 저장한다. */
const storedAsJson = (spec: FieldSpec) => spec.kind === "json" || spec.list === true;

function deviceDefault(column: DeviceColumn, spec: FieldSpec): JsonValue | undefined {
  if (column.dflt_value === null) return undefined;
  const raw = column.dflt_value.replace(/^'(.*)'$/, "$1");
  if (storedAsJson(spec)) return JSON.parse(raw);
  return SQLITE_TYPES[spec.kind] === "TEXT" ? raw : Number(raw);
}

const tables = new Map<string, DeviceColumn[]>();

beforeAll(async () => {
  const driver = createNodeSqliteDriver();
  await migrateDeviceDatabase(driver);
  const names = await driver.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  );
  for (const { name } of names) {
    tables.set(name, await driver.query<DeviceColumn>(`PRAGMA table_info("${name}")`));
  }
});

const builtRecords = RECORDS.filter((r) => !PLANNED_DEVICE_TABLES[r.type]);

describe("record definitions ↔ device SQLite", () => {
  it.each(RECORDS.map((r) => [r.type, r] as const))("%s has a device table", (type, definition) => {
    expect(tables.has(definition.table)).toBe(!PLANNED_DEVICE_TABLES[type]);
  });

  it.each(builtRecords.map((r) => [r.type, r] as const))(
    "%s has a column for every field and nothing unexplained",
    (type, definition) => {
      const actual = (tables.get(definition.table) ?? []).map((c) => c.name);
      const fields = Object.keys(definition.fields);
      const legacy = Object.keys(LEGACY_DEVICE_COLUMNS[type] ?? {});
      const allowed = [
        ...DEVICE_COMMON_COLUMNS,
        ...(definition.parent ? [definition.parent.column] : []),
        ...fields,
        ...legacy,
      ];

      expect({
        missing: fields.filter((c) => !actual.includes(c)),
        unexpected: actual.filter((c) => !allowed.includes(c)),
        staleLegacy: legacy.filter((c) => !actual.includes(c)),
      }).toEqual({ missing: [], unexpected: [], staleLegacy: [] });
    }
  );

  describe.each(builtRecords.map((r) => [r.type, r] as const))("%s fields", (_, definition) => {
    it.each(Object.entries(fieldSpecs(definition)))("%s matches its column", (name, spec) => {
      const column = tables.get(definition.table)?.find((c) => c.name === name) as DeviceColumn;
      expect(column.type).toBe(SQLITE_TYPES[spec.kind]);
      expect(column.notnull === 1).toBe(!spec.nullable);
      const dbDefault = deviceDefault(column, spec);
      if (dbDefault !== undefined) expect(spec.default?.value).toEqual(dbDefault);
    });
  });
});
