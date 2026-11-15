"use client";

import { isNativeAppUserAgent } from "./device";
import { type KeyValueDatabase, openSqliteKeyValueDatabase } from "./native/key-value-database";

/**
 * 자산 store envelope (Zustand persist 직렬화본) 을 기기에 두는 곳.
 *
 *   - 브라우저: localStorage (동기). 지금까지와 같다.
 *   - 네이티브 앱: SQLite (비동기). WebView 의 localStorage 는 OS 가 저장 공간이 부족할 때
 *     지울 수 있어, 앱에서는 사용자가 입력한 자산을 앱 데이터베이스에 둔다. 이전 앱 빌드가
 *     localStorage 에 남긴 값은 처음 읽을 때 SQLite 로 옮긴다. 플러그인이 없는 앱 빌드에서는
 *     localStorage 로 돌아간다.
 *
 * 동기화 대기열·화면 설정처럼 작은 기기 상태는 여전히 localStorage 에 둔다.
 */
export interface EnvelopeStore {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
  /** 이 기기의 envelope 를 모두 지운다 (회원 탈퇴). */
  clear: () => void | Promise<void>;
}

type LegacyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 접근이 막힌 localStorage (프라이빗 모드 등) 에서도 던지지 않는 래퍼. */
function safeStorage(storage: LegacyStorage): LegacyStorage {
  return {
    getItem: (key) => {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        storage.setItem(key, value);
      } catch {
        // quota / private mode — 조용히 무시
      }
    },
    removeItem: (key) => {
      try {
        storage.removeItem(key);
      } catch {
        // noop
      }
    },
  };
}

function createBrowserEnvelopeStore(): EnvelopeStore {
  const storage = safeStorage(window.localStorage);
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    // 브라우저 데이터는 회원 탈퇴 흐름이 localStorage 째로 비운다.
    clear: () => undefined,
  };
}

/**
 * SQLite 를 쓰는 envelope store. 모든 작업을 한 줄로 세워 호출 순서대로 적용한다 —
 * 기다리지 않은 쓰기 뒤의 읽기도 마지막 쓰기를 본다.
 */
export function createNativeEnvelopeStore(
  openDatabase: () => Promise<KeyValueDatabase | null>,
  legacyStorage: LegacyStorage
): EnvelopeStore {
  const legacy = safeStorage(legacyStorage);
  let database: Promise<KeyValueDatabase | null> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const openOnce = () => {
    database ??= openDatabase().catch((error: unknown) => {
      console.warn("[seedbook] SQLite unavailable, using localStorage", error);
      return null;
    });
    return database;
  };

  const enqueue = <T>(task: (db: KeyValueDatabase | null) => Promise<T>): Promise<T> => {
    const run = queue.then(async () => task(await openOnce()));
    queue = run.catch(() => undefined);
    return run;
  };

  const write = (task: (db: KeyValueDatabase | null) => Promise<void>) =>
    enqueue(task).catch((error: unknown) => {
      console.warn("[seedbook] failed to save to SQLite", error);
    });

  return {
    getItem: (key) =>
      enqueue(async (db) => {
        if (!db) return legacy.getItem(key);
        const stored = await db.get(key);
        if (stored !== null) return stored;
        const leftover = legacy.getItem(key);
        if (leftover === null) return null;
        await db.set(key, leftover);
        legacy.removeItem(key);
        return leftover;
      }),
    setItem: (key, value) =>
      write(async (db) => {
        if (db) await db.set(key, value);
        else legacy.setItem(key, value);
      }),
    removeItem: (key) =>
      write(async (db) => {
        if (db) await db.remove(key);
        else legacy.removeItem(key);
      }),
    clear: () =>
      write(async (db) => {
        if (db) await db.clear();
      }),
  };
}

let current: EnvelopeStore | null = null;

/** 이 기기의 envelope store. 네이티브 앱이면 SQLite, 아니면 localStorage. */
export function getLocalEnvelopeStore(): EnvelopeStore {
  current ??= isNativeAppUserAgent(window.navigator.userAgent)
    ? createNativeEnvelopeStore(openSqliteKeyValueDatabase, window.localStorage)
    : createBrowserEnvelopeStore();
  return current;
}
