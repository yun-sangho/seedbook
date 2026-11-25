import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqlDriver } from "./native/device-db/sql-driver";
import { createNodeSqliteDriver } from "./native/device-db/testing/node-sqlite-driver";

/** 쓰기마다 시간이 걸리고, 원하면 실패하거나 끝나지 않는 앱 SQLite. */
function slowDriver(inner: SqlDriver) {
  const control = { fail: false, hang: false };
  const driver: SqlDriver = {
    query: inner.query,
    batch: async (statements) => {
      if (control.hang) await new Promise(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (control.fail) throw new Error("disk I/O error");
      await inner.batch(statements);
    },
  };
  return { driver, control };
}

let sqlite: SqlDriver;
let slow: ReturnType<typeof slowDriver>;
const savedMode = async () =>
  (await sqlite.query<{ storageMode: string }>("SELECT storageMode FROM user_preference"))[0]
    ?.storageMode;

/** 같은 기기에서 페이지를 새로 연 것처럼 모듈을 다시 불러온다. */
async function launch(platform: "web" | "native" = "native") {
  vi.resetModules();
  vi.doMock("./device", () => ({ isNativeAppUserAgent: () => platform === "native" }));
  vi.doMock("./native/device-db/capacitor-driver", () => ({
    openCapacitorSqlDriver: async () => slow.driver,
  }));
  const { activateAccount, accountStorage } = await import("./account-storage");
  const mode = await import("./storage-mode");
  const device = await import("./device-storage");
  await activateAccount("u-1");
  return { ...mode, ...device, accountStorage };
}

beforeEach(() => {
  localStorage.clear();
  sqlite = createNodeSqliteDriver();
  slow = slowDriver(sqlite);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.doUnmock("./device");
  vi.doUnmock("./native/device-db/capacitor-driver");
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saveStorageMode (native)", () => {
  it("resolves only after the mode is in SQLite, even behind other waiting writes", async () => {
    const page = await launch();
    for (const key of ["a", "b", "c"]) page.accountStorage.removeItem(key);

    expect(await page.saveStorageMode("cloud")).toBe(true);

    expect(await savedMode()).toBe("cloud");
    expect((await launch()).getStorageMode()).toBe("cloud");
  });

  it("reports a failed save and goes back to the previous mode", async () => {
    const page = await launch();
    await page.flushDeviceStorage();
    slow.control.fail = true;

    expect(await page.saveStorageMode("cloud")).toBe(false);

    expect(page.getStorageMode()).toBe("local");
    slow.control.fail = false;
    await page.flushDeviceStorage();
    expect(await savedMode()).not.toBe("cloud");
  });

  it("gives up when the database does not answer", async () => {
    const page = await launch();
    await page.flushDeviceStorage();
    vi.useFakeTimers();
    slow.control.hang = true;

    const saving = page.saveStorageMode("cloud");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await saving).toBe(false);
    expect(page.getStorageMode()).toBe("local");
  });

  it("keeps another account's mode untouched", async () => {
    const first = await launch();
    await first.saveStorageMode("cloud");

    vi.resetModules();
    const { activateAccount } = await import("./account-storage");
    const { saveStorageMode, getStorageMode } = await import("./storage-mode");
    await activateAccount("u-2");
    expect(getStorageMode()).toBe("local");
    expect(await saveStorageMode("local")).toBe(true);

    expect(await savedMode()).toBe("cloud");
  });
});

describe("saveStorageMode (web)", () => {
  it("saves to localStorage", async () => {
    const page = await launch("web");

    expect(await page.saveStorageMode("cloud")).toBe(true);

    expect(localStorage.getItem("seedbook.storageMode")).toBe("cloud");
  });

  it("reports a failed save when localStorage rejects writes", async () => {
    const page = await launch("web");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(await page.saveStorageMode("cloud")).toBe(false);
  });
});

describe("reloadApp", () => {
  it("waits for waiting writes before reloading", async () => {
    const page = await launch();
    const savedAtReload: unknown[] = [];
    vi.stubGlobal("location", {
      reload: () => savedAtReload.push(savedMode()),
    });
    page.accountStorage.removeItem("a");
    page.setStorageMode("cloud");

    await page.reloadApp();

    expect(await Promise.all(savedAtReload)).toEqual(["cloud"]);
  });

  it("still reloads when a write fails", async () => {
    const page = await launch();
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    slow.control.fail = true;
    page.setStorageMode("cloud");

    await page.reloadApp();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
