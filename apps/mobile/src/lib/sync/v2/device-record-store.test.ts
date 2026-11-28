import { DEVICE_MIGRATIONS, migrateDeviceDatabase } from "@mobile/lib/native/device-db/migrations";
import { readQuarantine } from "@mobile/lib/native/device-db/record-store";
import { createNodeSqliteDriver } from "@mobile/lib/native/device-db/testing/node-sqlite-driver";
import { describe, expect, it } from "vitest";
import type { RecordChange } from "./changes";
import {
  createKvRecordStore,
  createSqlRecordStore,
  type DeviceRecordStore,
} from "./device-record-store";
import { memoryKv } from "./testing";

const HOLDING = "33333333-3333-4333-8333-333333333333";
const ACCOUNT = "11111111-1111-4111-8111-111111111111";

const holding = (fields: Record<string, unknown> = {}): RecordChange => ({
  op: "put",
  type: "holding",
  id: HOLDING,
  parentId: ACCOUNT,
  sortKey: "a0",
  fields: {
    market: "KRX",
    ticker: "005930",
    name: "삼성전자",
    currency: "KRW",
    quantity: 10,
    memo: "",
    ...fields,
  },
});

async function sqlStore(): Promise<DeviceRecordStore> {
  const driver = createNodeSqliteDriver();
  await migrateDeviceDatabase(driver, DEVICE_MIGRATIONS);
  return createSqlRecordStore(driver, "test");
}

const stores: Array<[string, () => Promise<DeviceRecordStore>]> = [
  ["key-value (browser)", async () => createKvRecordStore(memoryKv(), "seedbook.records")],
  ["SQLite records (app)", sqlStore],
];

describe.each(stores)("device record store: %s", (_, open) => {
  it("keeps fields the app does not know when a known field is patched", async () => {
    const store = await open();
    await store.apply([holding({ avgPrice: 70_000 })]);

    await store.apply([{ ...holding(), fields: { quantity: 12 } } as RecordChange]);

    expect((await store.load()).get(`holding:${HOLDING}`)?.fields).toMatchObject({
      quantity: 12,
      avgPrice: 70_000,
      ticker: "005930",
    });
  });

  it("does not write a field that fails validation and keeps the old value", async () => {
    const store = await open();
    await store.apply([holding()]);

    const { quarantined } = await store.apply([
      { ...holding(), fields: { quantity: 12, name: 42 } } as RecordChange,
    ]);

    expect(quarantined).toEqual([expect.objectContaining({ field: "name", code: "type" })]);
    expect((await store.load()).get(`holding:${HOLDING}`)?.fields).toMatchObject({
      quantity: 12,
      name: "삼성전자",
    });
  });

  it("does not create half a record when required fields are missing", async () => {
    const store = await open();

    const { quarantined } = await store.apply([
      { ...holding(), fields: { quantity: 1 } } as RecordChange,
    ]);

    expect(quarantined).toContainEqual(expect.objectContaining({ field: "*", code: "incomplete" }));
    expect((await store.load()).size).toBe(0);
  });

  it("deletes only what it is told to delete", async () => {
    const store = await open();
    await store.apply([holding()]);
    expect(await store.everStored(["holding"])).toBe(true);

    await store.apply([{ op: "delete", type: "holding", id: HOLDING }]);

    expect((await store.load()).size).toBe(0);
    // 모두 지웠어도 저장한 적은 있다 (옛 envelope 를 다시 옮기지 않는다).
    expect(await store.everStored(["holding"])).toBe(true);
  });
});

describe("SQLite record store", () => {
  it("writes through writeRecords, which quarantines rejected values in records_quarantine", async () => {
    const driver = createNodeSqliteDriver();
    await migrateDeviceDatabase(driver, DEVICE_MIGRATIONS);
    const store = createSqlRecordStore(driver, "test");
    await store.apply([holding()]);

    await store.apply([{ ...holding(), fields: { name: 42 } } as RecordChange]);

    expect(await readQuarantine(driver)).toEqual([
      expect.objectContaining({ type: "holding", field: "name", code: "type" }),
    ]);
  });
});

describe("key-value record store", () => {
  it("keeps an unreadable document aside instead of overwriting it", async () => {
    const kv = memoryKv();
    kv.setItem("seedbook.records", "{broken");
    const store = createKvRecordStore(kv, "seedbook.records");

    await store.apply([holding()]);

    expect(kv.getItem("seedbook.records.unreadable")).toBe("{broken");
    expect((await store.load()).size).toBe(1);
  });
});
