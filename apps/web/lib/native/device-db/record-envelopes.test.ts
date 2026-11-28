// @vitest-environment node
import { uuidv5 } from "@seedbook/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { migrateDeviceDatabase } from "./migrations";
import {
  DEVICE_SETTINGS_ID,
  isRecordEnvelopeKey,
  readRecordEnvelope,
  removeRecordEnvelope,
  writeRecordEnvelope,
} from "./record-envelopes";
import { readQuarantine, readRecords, writeRecords } from "./record-store";
import type { SqlDriver } from "./sql-driver";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  ALLOCATION,
  accountItem,
  CASH_A,
  envelope,
  HOLDING_A,
  HOLDING_B,
  holdingItem,
  investmentState,
  PORTFOLIO,
  portfolioItem,
  portfolioState,
  preferencesState,
  rebalancingState,
  SESSION,
} from "./testing/envelope-fixtures";
import { createNodeSqliteDriver } from "./testing/node-sqlite-driver";

const BY = "test@1";
let driver: SqlDriver;

beforeEach(async () => {
  driver = createNodeSqliteDriver();
  await migrateDeviceDatabase(driver);
});

const write = (key: string, state: Record<string, unknown>, version = 6) =>
  writeRecordEnvelope(driver, key, envelope(state, version), BY);

async function read(key: string) {
  const raw = await readRecordEnvelope(driver, key);
  return raw === null
    ? null
    : (JSON.parse(raw) as { state: Record<string, unknown>; version: number });
}

async function live(type: string) {
  return (await readRecords(driver, { types: [type] })).records;
}

describe("isRecordEnvelopeKey", () => {
  it("covers the synced asset stores and preferences, not account value history", () => {
    expect(isRecordEnvelopeKey("investment-storage")).toBe(true);
    expect(isRecordEnvelopeKey("portfolio-storage")).toBe(true);
    expect(isRecordEnvelopeKey("rebalancing-storage")).toBe(true);
    expect(isRecordEnvelopeKey("seedbook.preferences")).toBe(true);
    expect(isRecordEnvelopeKey("account-snapshot-storage")).toBe(false);
    expect(isRecordEnvelopeKey("stock-price-cache")).toBe(false);
  });
});

describe("investment-storage", () => {
  it("returns null when nothing has been saved", async () => {
    expect(await read("investment-storage")).toBeNull();
  });

  it("stores an account and each holding, cash item and value record as its own record", async () => {
    await write("investment-storage", investmentState());

    expect((await live("account")).map((r) => r.id)).toEqual([ACCOUNT_A, ACCOUNT_B]);
    expect((await live("holding")).map((r) => [r.id, r.parentId])).toEqual([
      [HOLDING_A, ACCOUNT_A],
      [HOLDING_B, ACCOUNT_A],
    ]);
    expect((await live("cash")).map((r) => r.id)).toEqual([CASH_A]);
    expect((await live("accountRecord")).map((r) => r.id).sort()).toEqual(
      [uuidv5(ACCOUNT_A, "2026-11-01"), uuidv5(ACCOUNT_A, "2026-10-01")].sort()
    );
  });

  it("reads back the store state it saved, in the saved order", async () => {
    const state = investmentState();
    state.investments.reverse();

    await write("investment-storage", state);

    expect(await read("investment-storage")).toEqual({ state, version: 4 });
  });

  it("returns value records newest first", async () => {
    const state = investmentState();
    state.investments[0]!.records.reverse();

    await write("investment-storage", state);

    const saved = (await read("investment-storage"))?.state.investments as Array<{
      records: Array<{ date: string }>;
    }>;
    expect(saved[0]?.records.map((r) => r.date)).toEqual(["2026-11-01", "2026-10-01"]);
  });

  it("tombstones a removed account together with its holdings, cash and records", async () => {
    await write("investment-storage", investmentState());

    await write("investment-storage", { investments: [accountItem(ACCOUNT_B, "연금 계좌")] });

    expect((await live("account")).map((r) => r.id)).toEqual([ACCOUNT_B]);
    expect(await live("holding")).toEqual([]);
    expect(await live("cash")).toEqual([]);
    expect(await live("accountRecord")).toEqual([]);
    expect(await driver.query("SELECT id FROM records WHERE deletedAt IS NOT NULL")).toHaveLength(
      6
    );
  });

  it("tombstones only the holding that was removed", async () => {
    const state = investmentState();
    await write("investment-storage", state);

    state.investments[0]!.holdings = [holdingItem(HOLDING_B, "000660", 2.5)];
    await write("investment-storage", state);

    expect((await live("holding")).map((r) => r.id)).toEqual([HOLDING_B]);
  });

  it("moves a holding to another account without deleting it", async () => {
    const state = investmentState();
    await write("investment-storage", state);

    state.investments[0]!.holdings = [holdingItem(HOLDING_B, "000660", 2.5)];
    state.investments[1]!.holdings = [holdingItem(HOLDING_A, "005930")];
    await write("investment-storage", state);

    expect((await live("holding")).map((r) => [r.id, r.parentId])).toEqual([
      [HOLDING_A, ACCOUNT_B],
      [HOLDING_B, ACCOUNT_A],
    ]);
  });

  it("keeps the last saved value of a field that fails validation and quarantines the new one", async () => {
    await write("investment-storage", investmentState());

    const state = investmentState();
    (state.investments[0] as Record<string, unknown>).accountName = 123;
    state.investments[0]!.note = "바뀜";
    await write("investment-storage", state);

    const saved = (await read("investment-storage"))?.state.investments as Array<
      Record<string, unknown>
    >;
    expect(saved[0]).toMatchObject({ accountName: "증권 계좌", note: "바뀜" });
    expect(await readQuarantine(driver)).toEqual([
      expect.objectContaining({ type: "account", id: ACCOUNT_A, field: "accountName" }),
    ]);
  });

  it("does not delete accounts when the envelope has no list", async () => {
    await write("investment-storage", investmentState());

    await write("investment-storage", {});

    expect(await live("account")).toHaveLength(2);
  });

  it("keeps fields a newer app stored on the record", async () => {
    await write("investment-storage", investmentState());
    await writeRecords(
      driver,
      [{ op: "put", type: "account", id: ACCOUNT_A, fields: {}, extra: { brokerCode: "K1" } }],
      { writtenBy: "newer@2" }
    );

    const state = investmentState();
    state.investments[0]!.note = "옛 앱이 고침";
    await write("investment-storage", state);

    const [record] = await live("account");
    expect(record?.data).toMatchObject({ brokerCode: "K1", note: "옛 앱이 고침" });
  });

  it("skips a second holding that reuses another account's holding id (first wins)", async () => {
    const state = investmentState();
    state.investments[1]!.holdings = [holdingItem(HOLDING_A, "999999")];

    await write("investment-storage", state);

    const holdings = await live("holding");
    expect(holdings.find((h) => h.id === HOLDING_A)?.data.ticker).toBe("005930");
  });
});

describe("portfolio-storage", () => {
  it("reads back the store state it saved", async () => {
    await write("portfolio-storage", portfolioState(), 4);

    expect(await read("portfolio-storage")).toEqual({ state: portfolioState(), version: 3 });
  });

  it("stores allocations as child records", async () => {
    await write("portfolio-storage", portfolioState(), 4);

    expect((await live("allocation")).map((r) => [r.id, r.parentId])).toEqual([
      [ALLOCATION, PORTFOLIO],
    ]);
  });

  it("mirrors the link on the account record (account.portfolioId)", async () => {
    await write("investment-storage", investmentState());

    await write("portfolio-storage", portfolioState(), 4);
    const linked = Object.fromEntries(
      (await live("account")).map((r) => [r.id, r.data.portfolioId])
    );
    expect(linked).toEqual({ [ACCOUNT_A]: PORTFOLIO, [ACCOUNT_B]: null });

    await write(
      "portfolio-storage",
      { portfolios: [portfolioItem({ accountIds: [ACCOUNT_B] })] },
      4
    );
    const relinked = Object.fromEntries(
      (await live("account")).map((r) => [r.id, r.data.portfolioId])
    );
    expect(relinked).toEqual({ [ACCOUNT_A]: null, [ACCOUNT_B]: PORTFOLIO });
  });

  it("links accounts saved after their portfolio", async () => {
    await write("portfolio-storage", portfolioState(), 4);

    await write("investment-storage", investmentState());

    const linked = Object.fromEntries(
      (await live("account")).map((r) => [r.id, r.data.portfolioId])
    );
    expect(linked).toEqual({ [ACCOUNT_A]: PORTFOLIO, [ACCOUNT_B]: null });
  });

  it("keeps the account link when the investment store saves again", async () => {
    await write("investment-storage", investmentState());
    await write("portfolio-storage", portfolioState(), 4);

    await write("investment-storage", investmentState());

    const [first] = await live("account");
    expect(first?.data.portfolioId).toBe(PORTFOLIO);
  });

  it("tombstones a removed portfolio and its allocations", async () => {
    await write("portfolio-storage", portfolioState(), 4);

    await write("portfolio-storage", { portfolios: [] }, 4);

    expect(await live("portfolio")).toEqual([]);
    expect(await live("allocation")).toEqual([]);
    expect(await read("portfolio-storage")).toEqual({ state: { portfolios: [] }, version: 3 });
  });
});

describe("rebalancing-storage", () => {
  it("reads back the store state it saved", async () => {
    await write("rebalancing-storage", rebalancingState(), 1);

    expect(await read("rebalancing-storage")).toEqual({ state: rebalancingState(), version: 1 });
  });

  it("stores each task as a record keyed by uuidv5(session, allocation)", async () => {
    await write("rebalancing-storage", rebalancingState(), 1);

    const [task] = await live("rebalancingTask");
    expect(task?.id).toBe(uuidv5(SESSION, ALLOCATION));
    expect(task?.data.allocationId).toBe(ALLOCATION);
  });

  it("fills task fields added later with null", async () => {
    const state = rebalancingState();
    const { executedPrice: _a, filledAmount: _b, ...oldTask } = state.sessions[0]!.tasks[0]!;
    state.sessions[0]!.tasks = [oldTask as (typeof state.sessions)[0]["tasks"][0]];

    await write("rebalancing-storage", state, 1);

    const saved = (await read("rebalancing-storage"))?.state.sessions as Array<{
      tasks: Array<Record<string, unknown>>;
    }>;
    expect(saved[0]?.tasks[0]).toMatchObject({ executedPrice: null, filledAmount: null });
  });

  it("quarantines a session whose id is not a UUID instead of writing it", async () => {
    const state = rebalancingState();
    state.sessions[0]!.id = "not-a-uuid";

    await write("rebalancing-storage", state, 1);

    expect(await live("rebalancing")).toEqual([]);
    expect(await readQuarantine(driver)).toEqual([
      expect.objectContaining({ type: "rebalancing", id: "not-a-uuid", code: "invalid" }),
    ]);
  });
});

describe("seedbook.preferences", () => {
  it("stores the account preferences as the settings record", async () => {
    await write("seedbook.preferences", preferencesState(), 1);

    const [settings] = await live("settings");
    expect(settings?.id).toBe(DEVICE_SETTINGS_ID);
    expect(await read("seedbook.preferences")).toEqual({ state: preferencesState(), version: 1 });
  });

  it("keeps an option value it does not know (enums are open — the store validates on read)", async () => {
    await write("seedbook.preferences", { ...preferencesState(), accountSortOption: "newer" }, 1);

    expect((await read("seedbook.preferences"))?.state.accountSortOption).toBe("newer");
  });

  it("keeps the saved value when an option has the wrong type", async () => {
    await write("seedbook.preferences", preferencesState(), 1);

    await write("seedbook.preferences", { ...preferencesState(), accountSortOption: 3 }, 1);

    expect((await read("seedbook.preferences"))?.state.accountSortOption).toBe("evalAsc");
  });
});

describe("removeRecordEnvelope", () => {
  it("tombstones every record of that store and nothing else", async () => {
    await write("investment-storage", investmentState());
    await write("portfolio-storage", portfolioState(), 4);

    await removeRecordEnvelope(driver, "portfolio-storage", BY);

    expect(await live("portfolio")).toEqual([]);
    expect(await live("allocation")).toEqual([]);
    expect(await live("account")).toHaveLength(2);
    expect((await live("account")).every((r) => r.data.portfolioId === null)).toBe(true);
  });
});
