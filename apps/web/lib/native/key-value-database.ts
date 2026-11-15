"use client";

/**
 * 네이티브 앱의 SQLite 키-값 테이블 (`@capacitor-community/sqlite`). Capacitor 는 원격
 * 페이지에도 브리지를 주입하므로 웹 번들에서 플러그인을 부른다. 브라우저·플러그인이 없는
 * 앱 빌드에서는 `openSqliteKeyValueDatabase` 가 null 을 돌려준다.
 */

export interface KeyValueDatabase {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
  clear: () => Promise<void>;
}

const DATABASE_NAME = "seedbook";
const DATABASE_VERSION = 1;

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);`;

const UPSERT =
  "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) " +
  "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;";

export async function openSqliteKeyValueDatabase(): Promise<KeyValueDatabase | null> {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("CapacitorSQLite")) {
    return null;
  }
  const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  // WebView 를 새로 고쳐도 네이티브 쪽 연결은 살아 있다 — 있으면 다시 쓴다.
  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const exists = (await sqlite.isConnection(DATABASE_NAME, false)).result;
  const db =
    consistent && exists
      ? await sqlite.retrieveConnection(DATABASE_NAME, false)
      : await sqlite.createConnection(
          DATABASE_NAME,
          false,
          "no-encryption",
          DATABASE_VERSION,
          false
        );
  if (!(await db.isDBOpen()).result) await db.open();
  await db.execute(CREATE_TABLE, false);

  return {
    get: async (key) => {
      const { values } = await db.query("SELECT value FROM kv WHERE key = ?;", [key]);
      const row = values?.[0] as { value?: unknown } | undefined;
      return typeof row?.value === "string" ? row.value : null;
    },
    set: async (key, value) => {
      await db.run(UPSERT, [key, value, Date.now()], false);
    },
    remove: async (key) => {
      await db.run("DELETE FROM kv WHERE key = ?;", [key], false);
    },
    clear: async () => {
      await db.run("DELETE FROM kv;", [], false);
    },
  };
}
