"use client";

import type { DeviceSnapshotStore, SnapshotRow } from "./integrity";
import type { SqlDriver, SqlValue } from "./sql-driver";

/**
 * **개발용** 브라우저 기기 저장소: WASM SQLite (`sql.js`). 앱과 같은 `records` 테이블·`CHECK`
 * 제약으로 브라우저에서 기기 저장 경로를 확인한다 (설계 §5.4, §12-4). 데이터베이스 파일은 쓸
 * 때마다 IndexedDB 에 통째로 저장한다 — 데이터가 작은 개발용이라 충분하다.
 *
 * 앱 dev 서버에서는 기본으로 쓴다 (`seedbook.deviceDb=local` 쿠키로 끈다, `wantsDevSqlite`).
 * 프로덕션 브라우저는 그대로 localStorage 다.
 */

const IDB_NAME = "seedbook-device-db";
const IDB_STORE = "files";
const DB_FILE = "seedbook.sqlite";
const SNAPSHOT_PREFIX = "snapshot:";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return idb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, mode);
        const request = run(tx.objectStore(IDB_STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

const idbGet = <T>(key: string) => idbRequest<T | undefined>("readonly", (s) => s.get(key));
const idbPut = (key: string, value: unknown) => idbRequest("readwrite", (s) => s.put(value, key));
const idbDelete = (key: string) => idbRequest("readwrite", (s) => s.delete(key));
const idbKeys = () => idbRequest("readonly", (s) => s.getAllKeys());

const SQLITE_COOKIE = "seedbook.deviceDb=sqlite";
const LOCAL_COOKIE = "seedbook.deviceDb=local";

/**
 * 브라우저에서 개발용 SQLite 를 쓸지. 앱 dev 서버(`NODE_ENV=development`)는 앱과 같은 저장 경로를
 * 보도록 기본으로 켜고 `seedbook.deviceDb=local` 쿠키로 끈다. 테스트는 `seedbook.deviceDb=sqlite`
 * 쿠키로만 켠다. 프로덕션 빌드는 쿠키와 상관없이 끈다.
 */
export function wantsDevSqlite({ cookie, nodeEnv }: { cookie: string; nodeEnv: string }): boolean {
  if (nodeEnv === "production") return false;
  const cookies = cookie.split(/;\s*/);
  if (cookies.includes(LOCAL_COOKIE)) return false;
  return nodeEnv === "development" || cookies.includes(SQLITE_COOKIE);
}

/** 이 브라우저가 개발용 SQLite 를 쓰는지 (`wantsDevSqlite`). */
export function isDevSqliteOptIn(): boolean {
  if (typeof document === "undefined") return false;
  return wantsDevSqlite({ cookie: document.cookie, nodeEnv: process.env.NODE_ENV ?? "" });
}

/**
 * sql.js (wasm 을 품은 1MB 남짓) 를 불러온다. 조건이 빌드 때 정해지는 상수라 프로덕션 번들에는
 * 이 chunk 가 생기지 않는다 (서비스 워커 precache 에도 들어가지 않는다).
 */
function loadSqlJs() {
  return process.env.NODE_ENV === "production"
    ? Promise.reject(new Error("sql.js is for development only"))
    : import("sql.js/dist/sql-wasm-inline.js");
}

export async function openSqlJsDriver(): Promise<SqlDriver> {
  const { default: initSqlJs } = await loadSqlJs();
  const SQL = await initSqlJs();
  const saved = await idbGet<Uint8Array>(DB_FILE);
  const db = new SQL.Database(saved);
  // export() 는 데이터베이스를 닫았다 다시 열어 PRAGMA 가 기본값으로 돌아간다 — 매번 다시 켠다.
  const pragmas = () => db.exec("PRAGMA foreign_keys = ON");
  pragmas();
  const persist = async () => {
    const bytes = db.export();
    pragmas();
    await idbPut(DB_FILE, bytes);
  };

  const run = (sql: string, params: SqlValue[] = []) => {
    const statement = db.prepare(sql);
    try {
      statement.run(params);
    } finally {
      statement.free();
    }
  };

  return {
    query: async <T>(sql: string, params: SqlValue[] = []) => {
      const statement = db.prepare(sql);
      try {
        statement.bind(params);
        const rows: T[] = [];
        while (statement.step()) rows.push(statement.getAsObject() as T);
        return rows;
      } finally {
        statement.free();
      }
    },
    batch: async (statements) => {
      db.exec("BEGIN");
      try {
        for (const { sql, params } of statements) run(sql, params);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      await persist();
    },
  };
}

/** 개발용 스냅샷 보관소 — IndexedDB 의 한 항목씩. */
export function openSqlJsSnapshotStore(): DeviceSnapshotStore {
  return {
    list: async () =>
      (await idbKeys())
        .map(String)
        .filter((k) => k.startsWith(SNAPSHOT_PREFIX))
        .map((k) => k.slice(SNAPSHOT_PREFIX.length)),
    save: async (name, rows) => {
      await idbPut(`${SNAPSHOT_PREFIX}${name}`, rows);
    },
    read: async (name) => (await idbGet<SnapshotRow[]>(`${SNAPSHOT_PREFIX}${name}`)) ?? [],
    remove: async (name) => {
      await idbDelete(`${SNAPSHOT_PREFIX}${name}`);
    },
  };
}
