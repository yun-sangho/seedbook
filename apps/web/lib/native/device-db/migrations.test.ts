// @vitest-environment node
import { schema } from "@seedbook/database";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { DEVICE_MIGRATIONS, migrateDeviceDatabase } from "./migrations";
import { createNodeSqliteDriver } from "./testing/node-sqlite-driver";

/** 서버에만 있는 컬럼 — 기기에는 한 사람의 데이터만 있고 동기화 상태가 없다. */
const SERVER_ONLY_COLUMNS = new Set(["userId", "version", "deletedAt"]);

/**
 * 동기화 v2 expand (v2-2) 가 서버에 더한 열. 기기는 v2-4a 에서 표를 레코드 JSON 테이블(`records`)로
 * 바꾸므로 지금 표에는 따라 넣지 않는다 (설계 §2.5).
 */
const SYNC_V2_SERVER_COLUMNS: Record<string, string[]> = {
  investment_account: ["changeSeq", "sortKey"],
  investment_record: ["id", "changeSeq", "createdAt", "updatedAt"],
  stock_holding: ["changeSeq", "sortKey", "createdAt", "updatedAt"],
  cash_item: ["changeSeq", "sortKey", "createdAt", "updatedAt"],
  portfolio: ["changeSeq", "sortKey"],
  portfolio_allocation: ["changeSeq", "sortKey", "createdAt", "updatedAt"],
  rebalancing: ["changeSeq", "sortKey"],
  user_preference: ["changeSeq", "createdAt", "updatedAt"],
};

/** 기기에만 있는 컬럼 — 설정은 한 행뿐이라 userId 대신 고정 id 를 쓴다. */
const DEVICE_ONLY_COLUMNS: Record<string, string[]> = { user_preference: ["id"] };

const MIRRORED_TABLES: PgTable[] = [
  schema.investmentAccount,
  schema.investmentRecord,
  schema.investmentAccountSnapshot,
  schema.stockHolding,
  schema.cashItem,
  schema.portfolio,
  schema.portfolioAllocation,
  schema.rebalancing,
  schema.userPreference,
  schema.userListOrder,
];

describe("device database schema", () => {
  it.each(MIRRORED_TABLES.map((table) => [getTableConfig(table).name, table] as const))(
    "%s has the same columns as the server table",
    async (name, table) => {
      const driver = createNodeSqliteDriver();
      await migrateDeviceDatabase(driver);

      const deviceColumns = (await driver.query<{ name: string }>(`PRAGMA table_info("${name}")`))
        .map((c) => c.name)
        .filter((c) => !(DEVICE_ONLY_COLUMNS[name] ?? []).includes(c));
      const serverColumns = getTableConfig(table)
        .columns.map((c) => c.name)
        .filter((c) => !SERVER_ONLY_COLUMNS.has(c))
        .filter((c) => !(SYNC_V2_SERVER_COLUMNS[name] ?? []).includes(c));

      expect(deviceColumns.sort()).toEqual(serverColumns.sort());
    }
  );

  it("applies each migration once", async () => {
    const driver = createNodeSqliteDriver();

    await migrateDeviceDatabase(driver);
    await migrateDeviceDatabase(driver);

    const applied = await driver.query<{ version: number }>(
      "SELECT version FROM device_schema_migration"
    );
    expect(applied).toHaveLength(DEVICE_MIGRATIONS.length);
  });

  it("applies only the versions added since the last launch", async () => {
    const driver = createNodeSqliteDriver();
    await migrateDeviceDatabase(driver, [{ version: 1, statements: ["CREATE TABLE a (x TEXT)"] }]);

    await migrateDeviceDatabase(driver, [
      { version: 1, statements: ["CREATE TABLE a (x TEXT)"] },
      { version: 2, statements: ["ALTER TABLE a ADD COLUMN y TEXT"] },
    ]);

    const columns = await driver.query<{ name: string }>("PRAGMA table_info(a)");
    expect(columns.map((c) => c.name)).toEqual(["x", "y"]);
  });
});
