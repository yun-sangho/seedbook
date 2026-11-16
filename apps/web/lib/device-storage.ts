"use client";

import type { StateStorage } from "zustand/middleware";
import { isNativeAppUserAgent } from "./device";
import { openCapacitorSqlDriver } from "./native/device-db/capacitor-driver";
import { migrateDeviceDatabase } from "./native/device-db/migrations";
import type { SqlDriver, SqlStatement } from "./native/device-db/sql-driver";
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
 *   - `readEnvelope` / `writeEnvelope`: Zustand persist envelope. 자산 store 는 서버와 같은 모양의
 *     테이블(`native/device-db/table-envelopes.ts`), 나머지(시세 캐시)는 `device_kv`.
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
  /** 이 기기의 Seedbook 데이터를 모두 지운다 (회원 탈퇴). */
  clear: () => void | Promise<void>;
  isReady: () => boolean;
  whenReady: () => Promise<void>;
  /** 대기 중인 SQLite 쓰기가 끝날 때까지 기다린다. */
  flush: () => Promise<void>;
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
    clear: () => safe(() => storage.clear(), undefined),
    isReady: () => true,
    whenReady: () => Promise.resolve(),
    flush: () => Promise.resolve(),
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

/** 이전 앱 빌드가 localStorage 에 남긴 값을 SQLite 로 옮기고 localStorage 를 비운다. */
async function moveLegacyStorage(
  driver: SqlDriver,
  legacy: LegacyStorage,
  memory: Map<string, string>
): Promise<void> {
  const keys = safe(
    () => Array.from({ length: legacy.length }, (_, i) => legacy.key(i)),
    [] as Array<string | null>
  ).filter((key): key is string => key !== null);
  for (const key of keys) {
    const value = safe(() => legacy.getItem(key), null);
    if (value === null) continue;
    if (isTableEnvelopeKey(key)) {
      if ((await readTableEnvelope(driver, key)) === null) {
        await writeTableEnvelope(driver, key, value);
      }
    } else if (!memory.has(key)) {
      memory.set(key, value);
      await driver.batch([kvWrite(key, value)]);
    }
  }
  safe(() => legacy.clear(), undefined);
}

/**
 * 네이티브 앱 저장소. 모든 SQLite 작업을 한 줄로 세워 호출 순서대로 적용한다. 데이터베이스를
 * 열 수 없으면 (플러그인이 없는 예전 앱 빌드) localStorage 로 돌아간다.
 */
export function createNativeDeviceStorage(
  openDriver: () => Promise<SqlDriver | null>,
  legacy: LegacyStorage
): DeviceStorage {
  const memory = new Map<string, string>();
  const fallback = createBrowserStorage(legacy);
  let driver: SqlDriver | null = null;
  let usingFallback = false;
  let ready = false;

  const opened = (async () => {
    try {
      const opened = await openDriver();
      if (!opened) {
        usingFallback = true;
        return;
      }
      await migrateDeviceDatabase(opened);
      const saved = await loadDeviceState(opened);
      // 준비 전에 쓴 값이 이긴다 (그 쓰기는 대기열에서 곧 저장된다).
      for (const [key, value] of saved) if (!memory.has(key)) memory.set(key, value);
      await moveLegacyStorage(opened, legacy, memory);
      driver = opened;
    } catch (error) {
      console.warn("[seedbook] SQLite unavailable, using localStorage", error);
      usingFallback = true;
    } finally {
      ready = true;
    }
  })();

  let queue: Promise<unknown> = opened;
  const enqueue = <T>(task: (db: SqlDriver) => Promise<T>, onFallback: () => T): Promise<T> => {
    const run = queue.then(() => (driver ? task(driver) : onFallback()));
    queue = run.catch((error: unknown) => {
      console.warn("[seedbook] SQLite write failed", error);
    });
    return run;
  };
  const persist = (statement: SqlStatement, onFallback: () => void) => {
    void enqueue((db) => db.batch([statement]), onFallback).catch(() => undefined);
  };

  return {
    getItem: (key) => {
      if (usingFallback) return fallback.getItem(key);
      return memory.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (usingFallback) return fallback.setItem(key, value);
      memory.set(key, value);
      persist(kvWrite(key, value), () => fallback.setItem(key, value));
    },
    removeItem: (key) => {
      if (usingFallback) return fallback.removeItem(key);
      memory.delete(key);
      persist(kvWrite(key, null), () => fallback.removeItem(key));
    },
    readEnvelope: (key) =>
      enqueue(
        async (db) =>
          isTableEnvelopeKey(key) ? readTableEnvelope(db, key) : (memory.get(key) ?? null),
        () => fallback.getItem(key)
      ),
    writeEnvelope: (key, value) =>
      enqueue(
        async (db) => {
          if (isTableEnvelopeKey(key)) {
            await writeTableEnvelope(db, key, value);
            return;
          }
          memory.set(key, value);
          await db.batch([kvWrite(key, value)]);
        },
        () => fallback.setItem(key, value)
      ).catch(() => undefined),
    removeEnvelope: (key) =>
      enqueue(
        async (db) => {
          if (isTableEnvelopeKey(key)) {
            await removeTableEnvelope(db, key);
            return;
          }
          memory.delete(key);
          await db.batch([kvWrite(key, null)]);
        },
        () => fallback.removeItem(key)
      ).catch(() => undefined),
    clear: async () => {
      memory.clear();
      await enqueue(
        (db) => clearDeviceTables(db),
        () => undefined
      );
      fallback.clear();
    },
    isReady: () => ready,
    whenReady: () => opened,
    flush: async () => {
      await queue;
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
  clear: () => undefined,
  isReady: () => true,
  whenReady: () => Promise.resolve(),
  flush: () => Promise.resolve(),
};

let current: DeviceStorage | null = null;

/** 이 기기의 저장소. 네이티브 앱이면 SQLite, 브라우저면 localStorage, 서버 렌더링이면 빈 저장소. */
export function getDeviceStorage(): DeviceStorage {
  if (typeof window === "undefined") return serverStorage;
  current ??= isNativeAppUserAgent(window.navigator.userAgent)
    ? createNativeDeviceStorage(openCapacitorSqlDriver, window.localStorage)
    : createBrowserStorage(window.localStorage);
  return current;
}

/** 네이티브 앱 저장소를 쓰는지 (예전 브라우저 데이터 업그레이드 같은 브라우저 전용 작업을 건너뛸 때). */
export function isNativeDeviceStorage(): boolean {
  return typeof window !== "undefined" && isNativeAppUserAgent(window.navigator.userAgent);
}

/**
 * 준비된 뒤 `fn` 을 부른다. 브라우저는 처음부터 준비돼 있어 동기로 끝난다 (기존 동작 유지).
 */
export function afterDeviceStorageReady<T>(fn: () => T | PromiseLike<T>): T | PromiseLike<T> {
  const storage = getDeviceStorage();
  return storage.isReady() ? fn() : storage.whenReady().then(fn);
}

/**
 * 저장소 모드와 상관없이 이 기기에만 두는 persist store (시세 캐시, 개인 설정 캐시) 의
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
