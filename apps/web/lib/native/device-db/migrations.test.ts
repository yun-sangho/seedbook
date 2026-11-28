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
