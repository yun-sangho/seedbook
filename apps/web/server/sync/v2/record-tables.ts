import { schema } from "@seedbook/database";
import { type FieldSpec, RECORDS, type RecordDefinition } from "@seedbook/domain";
import { getTableColumns, is } from "drizzle-orm";
import { getTableConfig, type PgColumn, PgTable } from "drizzle-orm/pg-core";

/**
 * 레코드 정의 → 서버 테이블·컬럼 (설계 §2.5). 필드 이름 = 컬럼 이름이다 (정의 ↔ drizzle 대조
 * 테스트 `test/domain-contract/server-schema.test.ts` 가 막는다). 공용 repo 는 이 표만 보고 9종을
 * 같은 코드로 다룬다.
 */

export interface FieldColumn {
  name: string;
  spec: FieldSpec;
  column: PgColumn;
}

export interface RecordTable {
  definition: RecordDefinition;
  table: PgTable;
  /** 레코드 id 컬럼 (`id`, 설정은 `userId`). */
  key: PgColumn;
  userId: PgColumn;
  /** 부모 id 컬럼 (하위 레코드만). */
  parent: PgColumn | null;
  version: PgColumn;
  changeSeq: PgColumn;
  deletedAt: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
  sortKey: PgColumn | null;
  fields: FieldColumn[];
  /**
   * 정의에 없는 옛 NOT NULL 컬럼 중 DB 기본값이 없는 것의 생성 값 (v2-5 에서 컬럼과 함께 지운다).
   * `rebalancing.tasks` — 할 일은 `rebalancing_task` 레코드다.
   */
  legacyInsert: Record<string, unknown>;
  /** 이 레코드를 부모로 갖는 하위 레코드 표 (부모를 지우면 같은 트랜잭션에서 톰스톤). */
  children: RecordTable[];
}

const LEGACY_INSERT: Record<string, Record<string, unknown>> = {
  rebalancing: { tasks: [] },
};

const PG_TABLES = new Map<string, PgTable>(
  Object.values(schema)
    .filter((value): value is Extract<typeof value, PgTable> => is(value, PgTable))
    .map((table) => [getTableConfig(table).name, table])
);

/**
 * 컬럼 하나. repo 는 drizzle 값 객체의 키로 컬럼 이름을 그대로 쓰므로 JS 속성 이름이 컬럼 이름과
 * 같아야 한다 (이 스키마의 규칙).
 */
function column(table: PgTable, name: string): PgColumn {
  const found = (getTableColumns(table) as Record<string, PgColumn>)[name];
  if (!found || found.name !== name) {
    throw new Error(`${getTableConfig(table).name}.${name}: 같은 이름의 컬럼·속성이 없다`);
  }
  return found;
}

function buildTable(definition: RecordDefinition): RecordTable {
  const table = PG_TABLES.get(definition.table);
  if (!table) throw new Error(`${definition.type}: 서버 테이블 ${definition.table} 이 없다`);
  return {
    definition,
    table,
    key: column(table, definition.key.kind === "singleton" ? "userId" : "id"),
    userId: column(table, "userId"),
    parent: definition.parent ? column(table, definition.parent.column) : null,
    version: column(table, "version"),
    changeSeq: column(table, "changeSeq"),
    deletedAt: column(table, "deletedAt"),
    createdAt: column(table, "createdAt"),
    updatedAt: column(table, "updatedAt"),
    sortKey: definition.sortable ? column(table, "sortKey") : null,
    fields: Object.entries(definition.fields).map(([name, field]) => ({
      name,
      spec: field.spec,
      column: column(table, name),
    })),
    legacyInsert: LEGACY_INSERT[definition.type] ?? {},
    children: [],
  };
}

export const RECORD_TABLES: ReadonlyMap<string, RecordTable> = (() => {
  const tables = new Map<string, RecordTable>(
    RECORDS.map((definition) => [definition.type, buildTable(definition)])
  );
  for (const table of tables.values()) {
    const parentType = table.definition.parent?.type;
    if (parentType) tables.get(parentType)?.children.push(table);
  }
  return tables;
})();

/** 정의의 값 → 컬럼 값. 금액은 bigint 컬럼이면 BigInt, 날짜·시각은 Date. */
export function toColumnValue(field: FieldColumn, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  const type = field.column.columnType;
  if (field.spec.kind === "money" && type === "PgBigInt64") return BigInt(value as number);
  if (field.spec.kind === "date" && type === "PgDate") return new Date(`${value}T00:00:00.000Z`);
  if (field.spec.kind === "timestamp" && type === "PgTimestamp") return new Date(value as string);
  return value;
}

/** 컬럼 값 → 정의의 값 (pull 로 내보내는 모양). */
export function fromColumnValue(field: FieldColumn, raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "bigint") return Number(raw);
  if (raw instanceof Date) {
    return field.spec.kind === "date" ? raw.toISOString().slice(0, 10) : raw.toISOString();
  }
  return raw;
}
