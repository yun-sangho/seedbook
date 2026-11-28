// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEVICE_MIGRATIONS, migrateDeviceDatabase } from "./migrations";
import { createNodeSqliteDriver } from "./testing/node-sqlite-driver";

describe("device database schema", () => {
  it("applies each migration once", async () => {
    const driver = createNodeSqliteDriver();

    await migrateDeviceDatabase(driver);
    await migrateDeviceDatabase(driver);

    const applied = await driver.query<{ version: number }>(
      "SELECT version FROM device_schema_migration"
    );
    expect(applied).toHaveLength(DEVICE_MIGRATIONS.length);
  });

  it("drops the old asset tables, list order and old quarantine but keeps the device tables", async () => {
    const driver = createNodeSqliteDriver();

    await migrateDeviceDatabase(driver);

    const tables = await driver.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    );
    const names = tables.map((t) => t.name);
    for (const gone of [
      "investment_account",
      "stock_holding",
      "cash_item",
      "investment_record",
      "portfolio",
      "portfolio_allocation",
      "rebalancing",
      "user_list_order",
      "device_quarantine",
    ]) {
      expect(names).not.toContain(gone);
    }
    expect(names).toEqual(
      expect.arrayContaining([
        "records",
        "records_history",
        "records_quarantine",
        "device_kv",
        "user_preference",
        "investment_account_snapshot",
        "investment_holding_history",
      ])
    );
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
