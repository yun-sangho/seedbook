"use client";

import type { StateStorage } from "zustand/middleware";
import { isNativeAppUserAgent } from "./device";
import { APP_BUILD } from "./native/device-db/app-build";
import {
  openCapacitorSnapshotStore,
  openCapacitorSqlDriver,
} from "./native/device-db/capacitor-driver";
import {
  type DeviceSnapshotStore,
  ensureDailySnapshot,
  runQuickCheck,
  takeSnapshot,
} from "./native/device-db/integrity";
import { DEVICE_MIGRATIONS, migrateDeviceDatabase } from "./native/device-db/migrations";
import {
  isRecordEnvelopeKey,
  readRecordEnvelope,
  removeRecordEnvelope,
  writeRecordEnvelope,
} from "./native/device-db/record-envelopes";
import { clearRecords } from "./native/device-db/record-store";
import { migrateTablesToRecords } from "./native/device-db/records-migration";
import type { SqlDriver, SqlStatement } from "./native/device-db/sql-driver";
import {
  isDevSqliteOptIn,
  openSqlJsDriver,
  openSqlJsSnapshotStore,
} from "./native/device-db/sqljs-driver";
import {
  clearDeviceTables,
  isTableEnvelopeKey,
  readTableEnvelope,
  removeTableEnvelope,
  writeTableEnvelope,
} from "./native/device-db/table-envelopes";

/**
 * 이 기기의 저장소. 브라우저는 localStorage, **네이티브 앱은 SQLite** 를 쓴다 — 앱에서는
 * localStorage 를 쓰지 않는다 (OS 가 저장 공간이 부족할 때 WebView 저장소를 지울 수 있다).
 *
 *   - `getItem` / `setItem` / `removeItem`: 작은 기기 상태 (동기화 대기열, 저장소 모드, 앱 잠금,
 *     화면 설정). 동기 API 라 앱에서는 시작할 때 SQLite 에서 메모리로 한 번 읽고, 쓰기는 메모리에
 *     바로 반영한 뒤 SQLite 에 차례로 저장한다. 저장소 모드는 서버처럼 `user_preference.storageMode`.
 *   - `readEnvelope` / `writeEnvelope`: Zustand persist envelope. 자산 store·계정 설정은 레코드 JSON
 *     (`records`, `native/device-db/record-envelopes.ts` 가 나누고 묶는다 — 쓰기는 `writeRecords()`
 *     하나로 검증·체크섬·이력), 계좌 총액 기록은 기기 표(`table-envelopes.ts`), 나머지(시세 캐시)는
 *     `device_kv`. 레코드 이전에 실패한 기기는 자산도 옛 표를 계속 쓴다.
 *
 * 시작할 때 저장 틀 마이그레이션(바꾸기 전 스냅샷) → `PRAGMA quick_check` → 옛 표 → `records` 이전 →
 * 하루 1회 스냅샷 순서로 준비한다 (`native/device-db/integrity.ts`).
 *
 * 계정 데이터(자산·동기화 대기열·저장소 모드·개인 설정)는 여기를 직접 쓰지 말고 계정별로 나누는
 * `account-storage.ts` 를 쓴다.
 *
 * 앱의 첫 읽기 전에 `whenReady()` 를 기다려야 한다. persist store 는 storage 가 기다리고,
 * 화면은 `HydrationGate` 가 그 store 들을 기다리므로 그 안의 컴포넌트는 따로 기다릴 필요가 없다.
 */
export interface DeviceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  readEnvelope: (key: string) => string | null | Promise<string | null>;
  writeEnvelope: (key: string, value: string) => void | Promise<void>;
  removeEnvelope: (key: string) => void | Promise<void>;
  /** `getItem` 으로 읽을 수 있는 키 목록 (네이티브의 자산 테이블은 빠진다). */
  keys: () => string[];
  /** 이 기기의 Seedbook 데이터를 모두 지운다 (회원 탈퇴). */
  clear: () => void | Promise<void>;
  isReady: () => boolean;
  whenReady: () => Promise<void>;
  /** 대기 중인 SQLite 쓰기가 끝날 때까지 기다린다. 모두 저장했으면 true, 남았으면 false. */
  flush: () => Promise<boolean>;
}

type LegacyStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "clear" | "key" | "length"
>;

/** 접근이 막힌 localStorage (프라이빗 모드 등) 에서도 던지지 않는 래퍼. */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function storageKeys(storage: LegacyStorage): string[] {
  return safe(
    () => Array.from({ length: storage.length }, (_, i) => storage.key(i)),
    [] as Array<string | null>
  ).filter((key): key is string => key !== null);
}

function createBrowserStorage(storage: LegacyStorage): DeviceStorage {
  const getItem = (key: string) => safe(() => storage.getItem(key), null);
  const setItem = (key: string, value: string) =>
    safe(() => storage.setItem(key, value), undefined);
  const removeItem = (key: string) => safe(() => storage.removeItem(key), undefined);
  return {
    getItem,
    setItem,
    removeItem,
    readEnvelope: getItem,
    writeEnvelope: setItem,
    removeEnvelope: removeItem,
    keys: () => storageKeys(storage),
    clear: () => safe(() => storage.clear(), undefined),
    isReady: () => true,
    whenReady: () => Promise.resolve(),
    flush: () => Promise.resolve(true),
  };
}

/** `device_kv` 대신 `user_preference` 컬럼에 두는 키 — 서버 스키마와 같은 자리. */
const PREFERENCE_COLUMN_KEYS: Record<string, { column: string; defaultValue: string }> = {
  "seedbook.storageMode": { column: "storageMode", defaultValue: "local" },
};

function kvWrite(key: string, value: string | null): SqlStatement {
  const preference = PREFERENCE_COLUMN_KEYS[key];
  if (preference) {
    return {
      sql: `INSERT INTO user_preference (id, ${preference.column}) VALUES (1, ?)
            ON CONFLICT(id) DO UPDATE SET ${preference.column} = excluded.${preference.column}`,
      params: [value ?? preference.defaultValue],
    };
  }
  if (value === null) return { sql: "DELETE FROM device_kv WHERE key = ?", params: [key] };
  return {
    sql: `INSERT INTO device_kv (key, value, updatedAt) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    params: [key, value, new Date().toISOString()],
  };
}

async function loadDeviceState(driver: SqlDriver): Promise<Map<string, string>> {
  const state = new Map<string, string>();
  const rows = await driver.query<{ key: string; value: string }>(
    "SELECT key, value FROM device_kv"
  );
  for (const row of rows) state.set(row.key, row.value);
  const [preference] = await driver.query<Record<string, string>>(
    `SELECT ${Object.values(PREFERENCE_COLUMN_KEYS)
      .map((p) => p.column)
      .join(", ")} FROM user_preference WHERE id = 1`
  );
  if (preference) {
    for (const [key, { column }] of Object.entries(PREFERENCE_COLUMN_KEYS)) {
      const value = preference[column];
      if (typeof value === "string") state.set(key, value);
    }
  }
  return state;
}

/** 자산 envelope 을 어디에 두나 — 레코드로 옮긴 기기는 `records`, 아니면 옛 표. */
interface EnvelopeTables {
  read: (driver: SqlDriver, key: string) => Promise<string | null>;
  write: (driver: SqlDriver, key: string, value: string) => Promise<void>;
  remove: (driver: SqlDriver, key: string) => Promise<void>;
}

function envelopeTables(usesRecords: boolean): EnvelopeTables {
  const records = (key: string) => usesRecords && isRecordEnvelopeKey(key);
  return {
    read: (driver, key) =>
      records(key) ? readRecordEnvelope(driver, key) : readTableEnvelope(driver, key),
    write: (driver, key, value) =>
      records(key)
        ? writeRecordEnvelope(driver, key, value, APP_BUILD)
        : writeTableEnvelope(driver, key, value),
    remove: (driver, key) =>
      records(key)
        ? removeRecordEnvelope(driver, key, APP_BUILD)
        : removeTableEnvelope(driver, key),
  };
}

/**
 * 이전 앱 빌드가 localStorage 에 남긴 값을 SQLite 로 옮긴다. `clear` 면 옮긴 뒤 localStorage 를
 * 비운다 (앱). 개발용 브라우저 SQLite 는 브라우저 데이터를 남겨 쿠키를 지우면 원래대로 돌아간다.
 */
async function moveLegacyStorage(
  driver: SqlDriver,
  tables: EnvelopeTables,
  legacy: LegacyStorage,
  memory: Map<string, string>,
  clear: boolean
): Promise<void> {
  for (const key of storageKeys(legacy)) {
    const value = safe(() => legacy.getItem(key), null);
    if (value === null) continue;
    if (isTableEnvelopeKey(key)) {
      if ((await tables.read(driver, key)) === null) {
        await tables.write(driver, key, value);
      }
    } else if (!memory.has(key)) {
      memory.set(key, value);
      await driver.batch([kvWrite(key, value)]);
    }
  }
  if (clear) safe(() => legacy.clear(), undefined);
}

export interface NativeStorageOptions {
  /** 스냅샷 보관소. 없으면 스냅샷을 남기지 않는다. */
  openSnapshots?: () => Promise<DeviceSnapshotStore | null>;
  /** 옛 localStorage 를 옮긴 뒤 비울지 (기본 true). */
  clearLegacy?: boolean;
}

/**
 * 데이터베이스를 쓸 수 있게 준비한다. 스냅샷·무결성 검사가 실패해도 시작은 계속한다 — 그것 때문에
 * localStorage 로 돌아가면 기기 데이터가 안 보인다. 레코드를 쓰는지 돌려준다.
 */
async function prepareDatabase(
  driver: SqlDriver,
  options: NativeStorageOptions
): Promise<{ usesRecords: boolean }> {
  const snapshots = await (options.openSnapshots?.() ?? Promise.resolve(null)).catch(
    (error: unknown) => {
      console.warn("[seedbook] snapshot store unavailable", error);
      return null;
    }
  );
  await migrateDeviceDatabase(driver, DEVICE_MIGRATIONS, {
    beforeMigrate: async () => {
      if (!snapshots) return;
      await takeSnapshot(driver, snapshots, "migration").catch((error: unknown) =>
        console.warn("[seedbook] snapshot before migration failed", error)
      );
    },
  });
  const check = await runQuickCheck(driver);
  const migration = await migrateTablesToRecords(driver, { writtenBy: APP_BUILD });
  const usesRecords = migration.status !== "failed";
  // 손상이 보이면 스냅샷을 새로 만들지 않는다 — 좋은 스냅샷이 밀려나지 않게.
  if (snapshots && check.ok && usesRecords) {
    await ensureDailySnapshot(driver, snapshots).catch((error: unknown) =>
      console.warn("[seedbook] daily snapshot failed", error)
    );
  }
  return { usesRecords };
}

/** 실패한 쓰기를 다시 시도하기까지 기다리는 시간 (실패할 때마다 두 배, 최대값까지). */
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;

/**
 * 네이티브 앱 저장소. SQLite 쓰기는 키마다 **마지막 값만** 대기열에 두고 차례로 저장한다 —
 * 같은 키를 여러 번 쓰면 마지막 것만 저장하고, 이미 저장한 값과 같으면 건너뛴다. 저장에
 * 실패한 값은 버리지 않고 대기열에 남겨 다음 쓰기·`flush`·재시도 타이머 때 다시 저장한다.
 * 데이터베이스를 열 수 없으면 (플러그인이 없는 예전 앱 빌드) localStorage 로 돌아간다.
 */
export function createNativeDeviceStorage(
  openDriver: () => Promise<SqlDriver | null>,
  legacy: LegacyStorage,
  options: NativeStorageOptions = {}
): DeviceStorage {
  const memory = new Map<string, string>();
  const fallback = createBrowserStorage(legacy);
  let driver: SqlDriver | null = null;
  let tables = envelopeTables(false);
  let usingFallback = false;
  let ready = false;

  const opened = (async () => {
    try {
      const opened = await openDriver();
      if (!opened) {
        usingFallback = true;
        return;
      }
      const { usesRecords } = await prepareDatabase(opened, options);
      tables = envelopeTables(usesRecords);
      const saved = await loadDeviceState(opened);
      // 준비 전에 쓴 값이 이긴다 (그 쓰기는 대기열에서 곧 저장된다).
      for (const [key, value] of saved) if (!memory.has(key)) memory.set(key, value);
      await moveLegacyStorage(opened, tables, legacy, memory, options.clearLegacy ?? true);
      driver = opened;
    } catch (error) {
      console.warn("[seedbook] SQLite unavailable, using localStorage", error);
      usingFallback = true;
    } finally {
      ready = true;
    }
  })();

  /** 저장할 값 (null = 지우기). 키마다 마지막 값 하나, 쓴 순서대로. */
  const pending = new Map<string, string | null>();
  /** 마지막으로 저장에 성공한 값 — 같은 값은 다시 쓰지 않는다. */
  const written = new Map<string, string | null>();
  let draining: Promise<void> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = RETRY_BASE_MS;

  const save = async (db: SqlDriver, key: string, value: string | null) => {
    if (!isTableEnvelopeKey(key)) await db.batch([kvWrite(key, value)]);
    else if (value === null) await tables.remove(db, key);
    else await tables.write(db, key, value);
  };

  const saveToFallback = (key: string, value: string | null) => {
    if (value === null) fallback.removeItem(key);
    else fallback.setItem(key, value);
  };

  const scheduleRetry = () => {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void drain();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  };

  const drainPending = async () => {
    await opened;
    for (const [key, value] of pending) {
      pending.delete(key);
      // 저장하는 동안에는 저장된 값을 모른다 — 그 사이 이전 값으로 되돌리는 쓰기를 건너뛰면 안 된다.
      written.delete(key);
      if (!driver) {
        saveToFallback(key, value);
        continue;
      }
      try {
        await save(driver, key, value);
        written.set(key, value);
        retryDelay = RETRY_BASE_MS;
      } catch (error) {
        console.warn("[seedbook] SQLite write failed, will retry", error);
        // 그 사이 새 값이 들어왔으면 그것이 이긴다.
        if (!pending.has(key)) pending.set(key, value);
        scheduleRetry();
        return;
      }
    }
  };

  /** 대기열을 비운다. 이미 비우는 중이면 그것이 끝난 뒤 남은 것을 이어서 비운다. */
  const drain = (): Promise<void> => {
    const run = (draining ?? Promise.resolve()).then(drainPending);
    const current = run.finally(() => {
      if (draining === current) draining = null;
    });
    draining = current;
    return current;
  };

  const enqueue = (key: string, value: string | null): Promise<void> => {
    if (!pending.has(key) && written.has(key) && written.get(key) === value) {
      return draining ?? Promise.resolve();
    }
    // 지우고 다시 넣어 마지막으로 쓴 순서를 지킨다.
    pending.delete(key);
    pending.set(key, value);
    return drain();
  };

  return {
    getItem: (key) => {
      if (usingFallback) return fallback.getItem(key);
      return memory.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (usingFallback) return fallback.setItem(key, value);
      memory.set(key, value);
      void enqueue(key, value);
    },
    removeItem: (key) => {
      if (usingFallback) return fallback.removeItem(key);
      memory.delete(key);
      void enqueue(key, null);
    },
    readEnvelope: async (key) => {
      await drain();
      if (!driver) return fallback.getItem(key);
      if (!isTableEnvelopeKey(key)) return memory.get(key) ?? null;
      // 저장에 실패해 대기 중인 값이 테이블보다 최신이다.
      if (pending.has(key)) return pending.get(key) ?? null;
      return tables.read(driver, key);
    },
    writeEnvelope: (key, value) => {
      if (!isTableEnvelopeKey(key)) memory.set(key, value);
      return enqueue(key, value);
    },
    removeEnvelope: (key) => {
      if (!isTableEnvelopeKey(key)) memory.delete(key);
      return enqueue(key, null);
    },
    keys: () => (usingFallback ? fallback.keys() : [...memory.keys()]),
    clear: async () => {
      memory.clear();
      pending.clear();
      written.clear();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      await drain();
      if (driver) {
        await clearDeviceTables(driver);
        await clearRecords(driver);
      }
      fallback.clear();
    },
    isReady: () => ready,
    whenReady: () => opened,
    flush: async () => {
      await drain();
      return pending.size === 0;
    },
  };
}

const serverStorage: DeviceStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  readEnvelope: () => null,
  writeEnvelope: () => undefined,
  removeEnvelope: () => undefined,
  keys: () => [],
  clear: () => undefined,
  isReady: () => true,
  whenReady: () => Promise.resolve(),
  flush: () => Promise.resolve(true),
};

let current: DeviceStorage | null = null;

/**
 * 이 기기의 저장소. 네이티브 앱이면 SQLite, 브라우저면 localStorage (개발 환경에서
 * `seedbook.deviceDb=sqlite` 쿠키가 있으면 WASM SQLite), 서버 렌더링이면 빈 저장소.
 */
export function getDeviceStorage(): DeviceStorage {
  if (typeof window === "undefined") return serverStorage;
  if (current) return current;
  if (isNativeAppUserAgent(window.navigator.userAgent)) {
    const storage = createNativeDeviceStorage(openCapacitorSqlDriver, window.localStorage, {
      openSnapshots: openCapacitorSnapshotStore,
    });
    // 앱이 백그라운드로 가면 OS 가 곧 멈추거나 종료할 수 있다 — 실패해 기다리던 쓰기를
    // 재시도 타이머를 기다리지 않고 바로 다시 저장한다.
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") void storage.flush();
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", () => void storage.flush());
    current = storage;
  } else if (isDevSqliteOptIn()) {
    // 개발용: 앱과 같은 SQLite 저장 경로를 브라우저(WASM)에서 확인한다.
    current = createNativeDeviceStorage(openSqlJsDriver, window.localStorage, {
      openSnapshots: async () => openSqlJsSnapshotStore(),
      clearLegacy: false,
    });
  } else {
    current = createBrowserStorage(window.localStorage);
  }
  return current;
}

/** 네이티브 쪽이 답하지 않아도 화면이 멈추지 않게, 저장을 기다리는 최대 시간. */
const FLUSH_TIMEOUT_MS = 10_000;

/** 대기 중인 쓰기를 모두 저장했으면 true. 실패했거나 너무 오래 걸리면 false. */
export async function flushDeviceStorage(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), FLUSH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([getDeviceStorage().flush(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 대기 중인 쓰기를 저장한 뒤 새로고침한다. 앱의 쓰기는 하나씩 네이티브로 보내므로, 기다리지 않고
 * 새로고침하면 뒤에 줄 선 값이 사라진다. 저장에 실패해도 새로고침은 한다 — 저장됐을 때만
 * 새로고침해야 하면 `flushDeviceStorage()` 의 결과를 본다.
 */
export async function reloadApp(): Promise<void> {
  await flushDeviceStorage();
  window.location.reload();
}

/**
 * SQLite 기기 저장소를 쓰는지 — 앱, 또는 개발용 브라우저 SQLite (예전 브라우저 데이터 업그레이드
 * 같은 localStorage 전용 작업을 건너뛸 때).
 */
export function isNativeDeviceStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    (isNativeAppUserAgent(window.navigator.userAgent) || isDevSqliteOptIn())
  );
}

/**
 * 준비된 뒤 `fn` 을 부른다. 브라우저는 처음부터 준비돼 있어 동기로 끝난다 (기존 동작 유지).
 */
export function afterDeviceStorageReady<T>(fn: () => T | PromiseLike<T>): T | PromiseLike<T> {
  const storage = getDeviceStorage();
  return storage.isReady() ? fn() : storage.whenReady().then(fn);
}

/**
 * 계정과 무관하게 이 기기에만 두는 persist store (시세 캐시) 의
 * `StateStorage`. `createJSONStorage(() => createDeviceStateStorage())` 로 쓴다.
 */
export function createDeviceStateStorage(): StateStorage {
  return {
    getItem: (name) =>
      afterDeviceStorageReady<string | null>(() => getDeviceStorage().readEnvelope(name)),
    setItem: (name, value) =>
      afterDeviceStorageReady(() => getDeviceStorage().writeEnvelope(name, value)),
    removeItem: (name) => afterDeviceStorageReady(() => getDeviceStorage().removeEnvelope(name)),
  };
}
