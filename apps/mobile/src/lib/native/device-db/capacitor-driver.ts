"use client";

import {
  type DeviceSnapshotStore,
  SNAPSHOT_COLUMNS,
  SNAPSHOT_PREFIX,
  SNAPSHOT_RECORDS_TABLE,
  type SnapshotRow,
} from "./integrity";
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

/** 플러그인이 데이터베이스 파일 이름에 붙이는 접미사. */
const DATABASE_SUFFIX = "SQLite.db";

/**
 * 스냅샷 보관소: 스냅샷마다 별도 SQLite 데이터베이스 파일 (설계 §5.7.3). 본 데이터베이스 파일이
 * 망가져도 남는다. 플러그인이 없으면 null.
 */
export async function openCapacitorSnapshotStore(): Promise<DeviceSnapshotStore | null> {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("CapacitorSQLite")) {
    return null;
  }
  const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  const withDatabase = async <T>(
    name: string,
    use: (db: Awaited<ReturnType<typeof sqlite.createConnection>>) => Promise<T>
  ): Promise<T> => {
    const exists = (await sqlite.isConnection(name, false)).result;
    const db = exists
      ? await sqlite.retrieveConnection(name, false)
      : await sqlite.createConnection(name, false, "no-encryption", 1, false);
    if (!(await db.isDBOpen()).result) await db.open();
    try {
      return await use(db);
    } finally {
      // delete() 뒤에는 이미 닫혀 있을 수 있다.
      await sqlite.closeConnection(name, false).catch(() => undefined);
    }
  };

  return {
    list: async () => {
      const { values = [] } = await sqlite.getDatabaseList();
      return values
        .map((value) => String(value))
        .filter((file) => file.startsWith(SNAPSHOT_PREFIX))
        .map((file) =>
          file.endsWith(DATABASE_SUFFIX) ? file.slice(0, -DATABASE_SUFFIX.length) : file
        );
    },
    save: (name, rows) =>
      withDatabase(name, async (db) => {
        const placeholders = SNAPSHOT_COLUMNS.map(() => "?").join(", ");
        await db.executeSet(
          [
            { statement: SNAPSHOT_RECORDS_TABLE, values: [] },
            { statement: "DELETE FROM records", values: [] },
            ...rows.map((row) => ({
              statement: `INSERT INTO records (${SNAPSHOT_COLUMNS.join(", ")}) VALUES (${placeholders})`,
              values: SNAPSHOT_COLUMNS.map((column) => row[column] ?? null),
            })),
          ],
          true
        );
      }),
    read: (name) =>
      withDatabase(name, async (db) => {
        const { values = [] } = await db.query("SELECT * FROM records ORDER BY type, id");
        return values as SnapshotRow[];
      }),
    remove: (name) => withDatabase(name, (db) => db.delete()),
  };
}
