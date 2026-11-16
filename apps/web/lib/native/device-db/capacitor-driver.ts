"use client";

import type { SqlDriver } from "./sql-driver";

/**
 * 네이티브 앱의 SQLite (`@capacitor-community/sqlite`). Capacitor 는 원격 페이지에도 브리지를
 * 주입하므로 웹 번들에서 플러그인을 부른다. 브라우저·플러그인이 없는 앱 빌드에서는 null.
 */

const DATABASE_NAME = "seedbook";

export async function openCapacitorSqlDriver(): Promise<SqlDriver | null> {
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
      : await sqlite.createConnection(DATABASE_NAME, false, "no-encryption", 1, false);
  if (!(await db.isDBOpen()).result) await db.open();

  return {
    query: async <T>(sql: string, params: (string | number | null)[] = []) => {
      const { values } = await db.query(sql, params);
      return (values ?? []) as T[];
    },
    batch: async (statements) => {
      await db.executeSet(
        statements.map(({ sql, params = [] }) => ({ statement: sql, values: params })),
        true
      );
    },
  };
}
