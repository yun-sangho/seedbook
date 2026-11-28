// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { migrateDeviceDatabase } from "./migrations";
import { readRecords } from "./record-store";
import {
  DEVICE_SETTINGS_ID,
  readSettingsEnvelope,
  removeSettingsEnvelope,
  writeSettingsEnvelope,
} from "./settings-envelope";
import type { SqlDriver } from "./sql-driver";
import { createNodeSqliteDriver } from "./testing/node-sqlite-driver";

const BY = "test-build";

const preferences = () => ({
  rebalancingTaskSort: "evalAsc",
  rebalancingCollapsedSections: ["filled"],
  accountSortOption: "evalAsc",
  portfolioStockSortOption: "nameAsc",
  holdingsSortOption: "nameAsc",
});

const envelope = (state: Record<string, unknown>) => JSON.stringify({ state, version: 1 });

async function read() {
  const raw = await readSettingsEnvelope(driver);
  return raw === null ? null : (JSON.parse(raw) as { state: Record<string, unknown> });
}

let driver: SqlDriver;

beforeEach(async () => {
  driver = createNodeSqliteDriver();
  await migrateDeviceDatabase(driver);
});

describe("settings envelope", () => {
  it("returns null when nothing has been saved", async () => {
    expect(await readSettingsEnvelope(driver)).toBeNull();
  });

  it("stores the account preferences as the settings record", async () => {
    await writeSettingsEnvelope(driver, envelope(preferences()), BY);

    const { records } = await readRecords(driver, { types: ["settings"] });
    expect(records.map((r) => r.id)).toEqual([DEVICE_SETTINGS_ID]);
    expect(JSON.parse((await readSettingsEnvelope(driver)) ?? "null")).toEqual({
      state: preferences(),
      version: 1,
    });
  });

  it("keeps an option value it does not know (the store validates on read)", async () => {
    await writeSettingsEnvelope(
      driver,
      envelope({ ...preferences(), accountSortOption: "newer" }),
      BY
    );

    expect((await read())?.state.accountSortOption).toBe("newer");
  });

  it("keeps the saved value when an option has the wrong type", async () => {
    await writeSettingsEnvelope(driver, envelope(preferences()), BY);

    await writeSettingsEnvelope(driver, envelope({ ...preferences(), accountSortOption: 3 }), BY);

    expect((await read())?.state.accountSortOption).toBe("evalAsc");
  });

  it("does not hand back a field the definition no longer has", async () => {
    await writeSettingsEnvelope(
      driver,
      envelope({ ...preferences(), investmentTrendRange: "1year" }),
      BY
    );

    expect((await read())?.state).toEqual(preferences());
  });

  it("is empty again after the preferences are removed", async () => {
    await writeSettingsEnvelope(driver, envelope(preferences()), BY);

    await removeSettingsEnvelope(driver, BY);

    expect(await readSettingsEnvelope(driver)).toBeNull();
  });
});
