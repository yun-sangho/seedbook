import { beforeEach, describe, expect, it } from "vitest";
import { createNativeEnvelopeStore } from "./local-envelope-store";
import type { KeyValueDatabase } from "./native/key-value-database";

/** 네이티브 SQLite 대신 쓰는 메모리 DB. */
function memoryDatabase(initial: Record<string, string> = {}) {
  const rows = new Map(Object.entries(initial));
  const database: KeyValueDatabase = {
    get: async (key) => rows.get(key) ?? null,
    set: async (key, value) => {
      rows.set(key, value);
    },
    remove: async (key) => {
      rows.delete(key);
    },
    clear: async () => rows.clear(),
  };
  return { rows, database };
}

describe("createNativeEnvelopeStore", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns null when nothing has been stored", async () => {
    const { database } = memoryDatabase();
    const store = createNativeEnvelopeStore(async () => database, window.localStorage);

    expect(await store.getItem("investment-storage")).toBeNull();
  });

  it("writes to the database instead of localStorage", async () => {
    const { rows, database } = memoryDatabase();
    const store = createNativeEnvelopeStore(async () => database, window.localStorage);

    await store.setItem("investment-storage", '{"state":{}}');

    expect(rows.get("investment-storage")).toBe('{"state":{}}');
    expect(window.localStorage.getItem("investment-storage")).toBeNull();
    expect(await store.getItem("investment-storage")).toBe('{"state":{}}');
  });

  it("moves data saved in localStorage by an earlier app version into the database on first read", async () => {
    window.localStorage.setItem("portfolio-storage", '{"state":{"portfolios":[]}}');
    const { rows, database } = memoryDatabase();
    const store = createNativeEnvelopeStore(async () => database, window.localStorage);

    const value = await store.getItem("portfolio-storage");

    expect(value).toBe('{"state":{"portfolios":[]}}');
    expect(rows.get("portfolio-storage")).toBe('{"state":{"portfolios":[]}}');
    expect(window.localStorage.getItem("portfolio-storage")).toBeNull();
  });

  it("prefers the database over a leftover localStorage copy", async () => {
    window.localStorage.setItem("portfolio-storage", "old");
    const { database } = memoryDatabase({ "portfolio-storage": "new" });
    const store = createNativeEnvelopeStore(async () => database, window.localStorage);

    expect(await store.getItem("portfolio-storage")).toBe("new");
  });

  it("falls back to localStorage when the database cannot be opened (app build without the plugin)", async () => {
    const store = createNativeEnvelopeStore(async () => null, window.localStorage);

    await store.setItem("investment-storage", "value");

    expect(window.localStorage.getItem("investment-storage")).toBe("value");
    expect(await store.getItem("investment-storage")).toBe("value");
  });

  it("falls back to localStorage when opening the database throws", async () => {
    const store = createNativeEnvelopeStore(async () => {
      throw new Error("plugin not implemented");
    }, window.localStorage);

    await store.setItem("investment-storage", "value");

    expect(await store.getItem("investment-storage")).toBe("value");
  });

  it("applies writes in call order so a read sees the last write", async () => {
    const { database } = memoryDatabase();
    const store = createNativeEnvelopeStore(async () => database, window.localStorage);

    void store.setItem("rebalancing-storage", "first");
    void store.setItem("rebalancing-storage", "second");

    expect(await store.getItem("rebalancing-storage")).toBe("second");
  });

  it("keeps working after a failed write", async () => {
    const { database } = memoryDatabase();
    let failNext = true;
    const flaky: KeyValueDatabase = {
      ...database,
      set: async (key, value) => {
        if (failNext) {
          failNext = false;
          throw new Error("disk full");
        }
        await database.set(key, value);
      },
    };
    const store = createNativeEnvelopeStore(async () => flaky, window.localStorage);

    await store.setItem("investment-storage", "lost");
    await store.setItem("investment-storage", "saved");

    expect(await store.getItem("investment-storage")).toBe("saved");
  });

  it("removes a key", async () => {
    const { rows, database } = memoryDatabase({ "investment-storage": "value" });
    const store = createNativeEnvelopeStore(async () => database, window.localStorage);

    await store.removeItem("investment-storage");

    expect(rows.has("investment-storage")).toBe(false);
  });

  it("clear empties the database", async () => {
    const { rows, database } = memoryDatabase({
      "investment-storage": "a",
      "portfolio-storage": "b",
    });
    const store = createNativeEnvelopeStore(async () => database, window.localStorage);

    await store.clear();

    expect(rows.size).toBe(0);
  });

  it("opens the database only once", async () => {
    const { database } = memoryDatabase();
    let opens = 0;
    const store = createNativeEnvelopeStore(async () => {
      opens += 1;
      return database;
    }, window.localStorage);

    await store.setItem("a", "1");
    await store.getItem("a");
    await store.removeItem("a");

    expect(opens).toBe(1);
  });
});
