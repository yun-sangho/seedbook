import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNativeDeviceStorage } from "./device-storage";
import { migrateDeviceDatabase } from "./native/device-db/migrations";
import type { SqlDriver, SqlStatement } from "./native/device-db/sql-driver";
import { createNodeSqliteDriver } from "./native/device-db/testing/node-sqlite-driver";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

const investmentEnvelope = (name: string) =>
  JSON.stringify({
    state: {
      investments: [
        {
          id: ACCOUNT,
          accountName: name,
          accountType: "일반 투자 계좌",
          currency: "KRW",
          initialInvestment: 0,
          currentValue: 0,
          note: "",
          color: "#000000",
          sellCostPercent: 0,
          records: [],
          holdings: [],
          cashItems: [],
        },
      ],
      holdingsSortOption: "evalDesc",
    },
    version: 6,
  });

let driver: SqlDriver;

beforeEach(() => {
  window.localStorage.clear();
  driver = createNodeSqliteDriver();
});

function nativeStorage() {
  return createNativeDeviceStorage(async () => driver, window.localStorage);
}

/** 실제 SQLite 를 감싸 batch 호출을 기록하고, `failNext` 만큼 실패시킨다. */
function recordingDriver(inner: SqlDriver) {
  const batches: SqlStatement[][] = [];
  const control = { failNext: 0 };
  const wrapped: SqlDriver = {
    query: inner.query,
    batch: async (statements) => {
      if (control.failNext > 0) {
        control.failNext -= 1;
        throw new Error("disk I/O error");
      }
      batches.push(statements);
      await inner.batch(statements);
    },
  };
  const writesTo = (table: string) =>
    batches.filter((statements) => statements.some((s) => s.sql.includes(`INSERT INTO ${table}`)))
      .length;
  return { driver: wrapped, control, writesTo };
}

describe("createNativeDeviceStorage", () => {
  it("reads device state saved on an earlier launch synchronously once ready", async () => {
    await migrateDeviceDatabase(driver);
    await driver.batch([
      {
        sql: "INSERT INTO device_kv (key, value, updatedAt) VALUES (?, ?, ?)",
        params: ["seedbook.app-lock", "on", "2026-11-16T00:00:00.000Z"],
      },
    ]);
    const storage = nativeStorage();

    await storage.whenReady();

    expect(storage.getItem("seedbook.app-lock")).toBe("on");
  });

  it("saves small device state to the device_kv table, not localStorage", async () => {
    const storage = nativeStorage();
    await storage.whenReady();

    storage.setItem("seedbook.mobile.accountSort", "nameAsc");
    await storage.flush();

    expect(await driver.query("SELECT key, value FROM device_kv")).toEqual([
      { key: "seedbook.mobile.accountSort", value: "nameAsc" },
    ]);
    expect(window.localStorage.length).toBe(0);
  });

  it("saves asset envelopes into the server-shaped tables", async () => {
    const storage = nativeStorage();

    await storage.writeEnvelope("investment-storage", investmentEnvelope("증권 계좌"));

    expect(await driver.query("SELECT accountName FROM investment_account")).toEqual([
      { accountName: "증권 계좌" },
    ]);
    const read = JSON.parse((await storage.readEnvelope("investment-storage")) as string);
    expect(read.state.investments[0].accountName).toBe("증권 계좌");
  });

  it("keeps other persisted stores (price cache) in device_kv", async () => {
    const storage = nativeStorage();

    await storage.writeEnvelope("stock-price-cache", '{"state":{"entries":{}},"version":2}');

    expect(await storage.readEnvelope("stock-price-cache")).toBe(
      '{"state":{"entries":{}},"version":2}'
    );
    expect(await driver.query("SELECT key FROM device_kv")).toEqual([{ key: "stock-price-cache" }]);
  });

  it("keeps the storage mode in user_preference.storageMode like the server", async () => {
    const storage = nativeStorage();
    await storage.whenReady();

    storage.setItem("seedbook.storageMode", "cloud");
    await storage.flush();

    expect(await driver.query("SELECT storageMode FROM user_preference")).toEqual([
      { storageMode: "cloud" },
    ]);
    const relaunched = nativeStorage();
    await relaunched.whenReady();
    expect(relaunched.getItem("seedbook.storageMode")).toBe("cloud");
  });

  it("moves data an earlier app build left in localStorage into SQLite and empties localStorage", async () => {
    window.localStorage.setItem("investment-storage", investmentEnvelope("예전 계좌"));
    window.localStorage.setItem("seedbook.app-lock", "on");
    const storage = nativeStorage();

    await storage.whenReady();

    expect(await driver.query("SELECT accountName FROM investment_account")).toEqual([
      { accountName: "예전 계좌" },
    ]);
    expect(storage.getItem("seedbook.app-lock")).toBe("on");
    expect(window.localStorage.length).toBe(0);
  });

  it("does not overwrite data already in SQLite with a leftover localStorage copy", async () => {
    const first = nativeStorage();
    await first.writeEnvelope("investment-storage", investmentEnvelope("SQLite 계좌"));
    window.localStorage.setItem("investment-storage", investmentEnvelope("남은 계좌"));

    const relaunched = nativeStorage();
    await relaunched.whenReady();

    expect(await driver.query("SELECT accountName FROM investment_account")).toEqual([
      { accountName: "SQLite 계좌" },
    ]);
  });

  it("keeps a write made before the database finished loading", async () => {
    await migrateDeviceDatabase(driver);
    await driver.batch([
      {
        sql: "INSERT INTO device_kv (key, value, updatedAt) VALUES (?, ?, ?)",
        params: ["seedbook.mobile.accountSort", "old", "2026-11-16T00:00:00.000Z"],
      },
    ]);
    const storage = nativeStorage();

    storage.setItem("seedbook.mobile.accountSort", "new");
    await storage.whenReady();
    await storage.flush();

    expect(storage.getItem("seedbook.mobile.accountSort")).toBe("new");
    expect(await driver.query("SELECT value FROM device_kv")).toEqual([{ value: "new" }]);
  });

  it("applies envelope writes in call order", async () => {
    const storage = nativeStorage();

    void storage.writeEnvelope("investment-storage", investmentEnvelope("처음"));
    void storage.writeEnvelope("investment-storage", investmentEnvelope("나중"));

    const read = JSON.parse((await storage.readEnvelope("investment-storage")) as string);
    expect(read.state.investments[0].accountName).toBe("나중");
  });

  it("writes only the latest envelope when several are waiting for the same key", async () => {
    const recording = recordingDriver(driver);
    const storage = createNativeDeviceStorage(async () => recording.driver, window.localStorage);

    void storage.writeEnvelope("investment-storage", investmentEnvelope("1"));
    void storage.writeEnvelope("investment-storage", investmentEnvelope("2"));
    void storage.writeEnvelope("investment-storage", investmentEnvelope("3"));
    await storage.flush();

    expect(recording.writesTo("investment_account")).toBe(1);
    expect(await driver.query("SELECT accountName FROM investment_account")).toEqual([
      { accountName: "3" },
    ]);
  });

  it("does not rewrite the tables when the envelope did not change", async () => {
    const recording = recordingDriver(driver);
    const storage = createNativeDeviceStorage(async () => recording.driver, window.localStorage);
    await storage.writeEnvelope("investment-storage", investmentEnvelope("계좌"));

    await storage.writeEnvelope("investment-storage", investmentEnvelope("계좌"));

    expect(recording.writesTo("investment_account")).toBe(1);
  });

  it("keeps a failed write and saves it on the next flush", async () => {
    const recording = recordingDriver(driver);
    const storage = createNativeDeviceStorage(async () => recording.driver, window.localStorage);
    await storage.whenReady();
    recording.control.failNext = 1;

    storage.setItem("seedbook.app-lock", "on"); // 이 쓰기는 실패한다
    await storage.flush();

    expect(recording.control.failNext).toBe(0);
    expect(await driver.query("SELECT value FROM device_kv")).toEqual([{ value: "on" }]);
  });

  it("reports whether every waiting write was saved", async () => {
    const recording = recordingDriver(driver);
    const storage = createNativeDeviceStorage(async () => recording.driver, window.localStorage);
    await storage.whenReady();
    recording.control.failNext = 2;

    storage.setItem("seedbook.app-lock", "on");

    expect(await storage.flush()).toBe(false);
    expect(await storage.flush()).toBe(true);
  });

  it("saves a value that goes back to the old one while another write is in flight", async () => {
    let release: () => void = () => undefined;
    let gate: Promise<void> = Promise.resolve();
    const storage = createNativeDeviceStorage(
      async () => ({
        query: driver.query,
        batch: async (statements) => {
          await gate;
          await driver.batch(statements);
        },
      }),
      window.localStorage
    );
    storage.setItem("seedbook.app-lock", "off");
    await storage.flush();
    gate = new Promise((resolve) => {
      release = resolve;
    });
    storage.setItem("seedbook.app-lock", "on");
    await new Promise((resolve) => setTimeout(resolve, 0)); // "on" 저장이 시작됨

    storage.setItem("seedbook.app-lock", "off");
    release();
    await storage.flush();

    expect(await driver.query("SELECT value FROM device_kv")).toEqual([{ value: "off" }]);
  });

  it("reads back an envelope whose write failed instead of the older saved copy", async () => {
    const recording = recordingDriver(driver);
    const storage = createNativeDeviceStorage(async () => recording.driver, window.localStorage);
    await storage.writeEnvelope("investment-storage", investmentEnvelope("예전"));
    recording.control.failNext = 1;

    await storage.writeEnvelope("investment-storage", investmentEnvelope("새"));

    const read = JSON.parse((await storage.readEnvelope("investment-storage")) as string);
    expect(read.state.investments[0].accountName).toBe("새");
  });

  it("retries a failed write on its own after a delay", async () => {
    vi.useFakeTimers();
    try {
      const recording = recordingDriver(driver);
      const storage = createNativeDeviceStorage(async () => recording.driver, window.localStorage);
      await storage.whenReady();
      recording.control.failNext = 1;

      storage.setItem("seedbook.app-lock", "on");
      await vi.advanceTimersByTimeAsync(0);
      expect(await driver.query("SELECT value FROM device_kv")).toEqual([]);
      await vi.advanceTimersByTimeAsync(2_000);

      expect(await driver.query("SELECT value FROM device_kv")).toEqual([{ value: "on" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears every table and the in-memory state", async () => {
    const storage = nativeStorage();
    await storage.writeEnvelope("investment-storage", investmentEnvelope("계좌"));
    storage.setItem("seedbook.app-lock", "on");

    await storage.clear();

    expect(storage.getItem("seedbook.app-lock")).toBeNull();
    expect(await storage.readEnvelope("investment-storage")).toBeNull();
    expect(await driver.query("SELECT * FROM device_kv")).toEqual([]);
  });

  it("falls back to localStorage when the app build has no SQLite plugin", async () => {
    const storage = createNativeDeviceStorage(async () => null, window.localStorage);
    await storage.whenReady();

    storage.setItem("seedbook.app-lock", "on");
    await storage.writeEnvelope("investment-storage", "{}");

    expect(window.localStorage.getItem("seedbook.app-lock")).toBe("on");
    expect(await storage.readEnvelope("investment-storage")).toBe("{}");
  });

  it("falls back to localStorage when opening the database fails", async () => {
    const storage = createNativeDeviceStorage(async () => {
      throw new Error("plugin not implemented");
    }, window.localStorage);
    await storage.whenReady();

    storage.setItem("seedbook.app-lock", "on");

    expect(storage.getItem("seedbook.app-lock")).toBe("on");
    expect(window.localStorage.getItem("seedbook.app-lock")).toBe("on");
  });
});
