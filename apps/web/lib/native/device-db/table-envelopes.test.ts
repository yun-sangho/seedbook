// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { migrateDeviceDatabase } from "./migrations";
import type { SqlDriver } from "./sql-driver";
import {
  clearDeviceTables,
  isTableEnvelopeKey,
  readTableEnvelope,
  removeTableEnvelope,
  writeTableEnvelope,
} from "./table-envelopes";
import { createNodeSqliteDriver } from "./testing/node-sqlite-driver";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";

function envelope(state: Record<string, unknown>, version: number) {
  return JSON.stringify({ state, version });
}

async function read(driver: SqlDriver, key: string) {
  const raw = await readTableEnvelope(driver, key);
  return raw === null
    ? null
    : (JSON.parse(raw) as { state: Record<string, unknown>; version: number });
}

let driver: SqlDriver;

beforeEach(async () => {
  driver = createNodeSqliteDriver();
  await migrateDeviceDatabase(driver);
});

describe("isTableEnvelopeKey", () => {
  it("covers the account value history only (assets are records)", () => {
    expect(isTableEnvelopeKey("account-snapshot-storage")).toBe(true);
    expect(isTableEnvelopeKey("holdings-history-storage")).toBe(true);
    expect(isTableEnvelopeKey("investment-storage")).toBe(false);
    expect(isTableEnvelopeKey("seedbook.preferences")).toBe(false);
    expect(isTableEnvelopeKey("stock-price-cache")).toBe(false);
  });
});

describe("account-snapshot-storage", () => {
  const snapshot = (date: string, totalValue: number, oldestPriceDate: string | null) => ({
    accountId: ACCOUNT_A,
    date,
    stockValue: totalValue + 500,
    cashValue: -500,
    totalValue,
    holdingCount: 2,
    missingPriceCount: 1,
    oldestPriceDate,
  });

  it("returns null when nothing has been saved", async () => {
    expect(await readTableEnvelope(driver, "account-snapshot-storage")).toBeNull();
  });

  it("stores the daily values in the server-shaped table, oldest first", async () => {
    await writeTableEnvelope(
      driver,
      "account-snapshot-storage",
      envelope(
        {
          snapshots: [
            snapshot("2026-11-25", 2_000, null),
            snapshot("2026-11-24", 1_000, "2026-11-21"),
            { accountId: "broken" },
          ],
        },
        1
      )
    );

    expect(await read(driver, "account-snapshot-storage")).toEqual({
      state: {
        snapshots: [
          snapshot("2026-11-24", 1_000, "2026-11-21"),
          snapshot("2026-11-25", 2_000, null),
        ],
      },
      version: 1,
    });
  });

  it("replaces the rows on the next write", async () => {
    await writeTableEnvelope(
      driver,
      "account-snapshot-storage",
      envelope({ snapshots: [snapshot("2026-11-24", 1, null)] }, 1)
    );
    await writeTableEnvelope(
      driver,
      "account-snapshot-storage",
      envelope({ snapshots: [snapshot("2026-11-25", 2, null)] }, 1)
    );

    const stored = await read(driver, "account-snapshot-storage");
    expect(stored?.state.snapshots).toEqual([snapshot("2026-11-25", 2, null)]);
  });
});

describe("holdings-history-storage", () => {
  const accounts = {
    [ACCOUNT_A]: {
      holdings: [{ market: "KOSPI", ticker: "005930", quantity: 3 }],
      cash: [-20, 100],
    },
  };

  it("round-trips the holdings entries and stop markers, oldest first", async () => {
    await writeTableEnvelope(
      driver,
      "holdings-history-storage",
      envelope(
        {
          entries: [
            { date: "2026-11-26", accounts: null },
            { date: "2026-11-24", accounts },
            { date: "not-a-date", accounts },
          ],
        },
        1
      )
    );

    expect(await read(driver, "holdings-history-storage")).toEqual({
      state: {
        entries: [
          { date: "2026-11-24", accounts },
          { date: "2026-11-26", accounts: null },
        ],
      },
      version: 1,
    });
  });
});

describe("removeTableEnvelope", () => {
  it("removes the daily values", async () => {
    await writeTableEnvelope(
      driver,
      "account-snapshot-storage",
      envelope(
        {
          snapshots: [
            {
              accountId: ACCOUNT_A,
              date: "2026-11-24",
              stockValue: 1,
              cashValue: 0,
              totalValue: 1,
              holdingCount: 1,
              missingPriceCount: 0,
              oldestPriceDate: null,
            },
          ],
        },
        1
      )
    );

    await removeTableEnvelope(driver, "account-snapshot-storage");

    expect(await readTableEnvelope(driver, "account-snapshot-storage")).toBeNull();
  });
});

describe("clearDeviceTables", () => {
  it("removes every saved row", async () => {
    await writeTableEnvelope(
      driver,
      "holdings-history-storage",
      envelope({ entries: [{ date: "2026-11-24", accounts: null }] }, 1)
    );
    await driver.batch([
      {
        sql: "INSERT INTO device_kv (key, value, updatedAt) VALUES ('k', 'v', '2026-11-28')",
      },
    ]);

    await clearDeviceTables(driver);

    expect(await readTableEnvelope(driver, "holdings-history-storage")).toBeNull();
    expect(await driver.query("SELECT * FROM device_kv")).toEqual([]);
  });
});
