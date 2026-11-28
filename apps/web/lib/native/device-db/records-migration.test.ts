// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { META_RECORDS_MIGRATED_AT, META_RECORDS_MIGRATION_FAILURE, readMeta } from "./device-meta";
import { migrateDeviceDatabase } from "./migrations";
import { RECORD_ENVELOPE_KEYS, readRecordEnvelope } from "./record-envelopes";
import { readQuarantine, readRecords } from "./record-store";
import { migrateTablesToRecords, usesRecords } from "./records-migration";
import type { SqlDriver } from "./sql-driver";
import { readTableEnvelope, writeTableEnvelope } from "./table-envelopes";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  envelope,
  investmentState,
  PORTFOLIO,
  portfolioState,
  preferencesState,
  rebalancingState,
} from "./testing/envelope-fixtures";
import { createNodeSqliteDriver } from "./testing/node-sqlite-driver";

const options = { writtenBy: "test@1" };
let driver: SqlDriver;

/** 버전 6 까지의 앱이 옛 테이블에 저장해 둔 기기. */
async function seedLegacyTables() {
  await writeTableEnvelope(driver, "investment-storage", envelope(investmentState(), 6));
  await writeTableEnvelope(driver, "portfolio-storage", envelope(portfolioState(), 4));
  await writeTableEnvelope(driver, "rebalancing-storage", envelope(rebalancingState(), 1));
  await writeTableEnvelope(driver, "seedbook.preferences", envelope(preferencesState(), 1));
}

async function countRecords() {
  const [row] = await driver.query<{ count: number }>("SELECT COUNT(*) AS count FROM records");
  const count = row?.count ?? 0;
  return Number(count);
}

beforeEach(async () => {
  driver = createNodeSqliteDriver();
  await migrateDeviceDatabase(driver);
});

describe("migrateTablesToRecords", () => {
  it("gives the stores the same envelopes from records as from the old tables", async () => {
    await seedLegacyTables();
    const before = await Promise.all(RECORD_ENVELOPE_KEYS.map((k) => readTableEnvelope(driver, k)));

    const result = await migrateTablesToRecords(driver, options);

    expect(result).toMatchObject({ status: "done", records: 12 });
    const after = await Promise.all(RECORD_ENVELOPE_KEYS.map((k) => readRecordEnvelope(driver, k)));
    expect(after.map((e) => (e === null ? null : JSON.parse(e)))).toEqual(
      before.map((e) => (e === null ? null : JSON.parse(e)))
    );
  });

  it("copies the account ↔ portfolio link onto the account record", async () => {
    await seedLegacyTables();

    await migrateTablesToRecords(driver, options);

    const { records } = await readRecords(driver, { types: ["account"] });
    expect(Object.fromEntries(records.map((r) => [r.id, r.data.portfolioId]))).toEqual({
      [ACCOUNT_A]: PORTFOLIO,
      [ACCOUNT_B]: null,
    });
  });

  it("keeps the old tables", async () => {
    await seedLegacyTables();

    await migrateTablesToRecords(driver, options);

    expect(await driver.query("SELECT id FROM investment_account")).toHaveLength(2);
  });

  it("moves the #91 quarantine into the records quarantine", async () => {
    await driver.batch([
      {
        sql: "INSERT INTO device_quarantine (storageKey, itemId, item, quarantinedAt) VALUES (?, ?, ?, ?)",
        params: ["investment-storage", "broken", '{"id":"broken"}', "2026-11-01T00:00:00.000Z"],
      },
    ]);

    await migrateTablesToRecords(driver, options);

    expect(await readQuarantine(driver)).toEqual([
      {
        type: "account",
        id: "broken",
        field: "*",
        source: "legacy",
        code: "legacy",
        value: '{"id":"broken"}',
      },
    ]);
  });

  it("runs once", async () => {
    await seedLegacyTables();
    await migrateTablesToRecords(driver, options);

    expect(await migrateTablesToRecords(driver, options)).toEqual({ status: "already" });
    expect(await usesRecords(driver)).toBe(true);
  });

  it("finishes on a fresh device with nothing to move", async () => {
    expect(await migrateTablesToRecords(driver, options)).toEqual({
      status: "done",
      records: 0,
      quarantined: 0,
    });
    expect(await usesRecords(driver)).toBe(true);
  });

  it("rolls back and keeps using the old tables when the written rows do not verify", async () => {
    await seedLegacyTables();
    // 쓰기는 성공했지만 행 하나가 깨진 채 저장된 상황.
    const wrapped: SqlDriver = {
      ...driver,
      batch: async (statements) => {
        await driver.batch(statements);
        if (statements.some((s) => s.params?.includes(META_RECORDS_MIGRATED_AT))) {
          await driver.batch([
            {
              sql: "UPDATE records SET checksum = ? WHERE rowid = (SELECT MIN(rowid) FROM records)",
              params: ["0".repeat(64)],
            },
          ]);
        }
      },
    };

    const result = await migrateTablesToRecords(wrapped, options);

    expect(result).toMatchObject({ status: "failed", reason: expect.stringContaining("checksum") });
    expect(await usesRecords(driver)).toBe(false);
    expect(await countRecords()).toBe(0);
    expect(await readMeta(driver, META_RECORDS_MIGRATION_FAILURE)).toContain("checksum");
    expect(await readTableEnvelope(driver, "investment-storage")).not.toBeNull();
  });

  it("keeps using the old tables when the write itself fails, and retries next launch", async () => {
    await seedLegacyTables();
    const failing: SqlDriver = {
      ...driver,
      batch: async (statements) => {
        if (
          statements.some(
            (s) => s.params?.includes(META_RECORDS_MIGRATED_AT) && s.params.length > 1
          )
        ) {
          throw new Error("disk I/O error");
        }
        await driver.batch(statements);
      },
    };

    expect(await migrateTablesToRecords(failing, options)).toMatchObject({ status: "failed" });
    expect(await usesRecords(driver)).toBe(false);

    expect(await migrateTablesToRecords(driver, options)).toMatchObject({ status: "done" });
  });
});
