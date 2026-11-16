import { DatabaseSync } from "node:sqlite";
import type { SqlDriver } from "../sql-driver";

/** 테스트용 메모리 SQLite (Node 내장). 앱의 Capacitor 드라이버와 같은 인터페이스. */
export function createNodeSqliteDriver(): SqlDriver & { close: () => void } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return {
    query: async <T>(sql: string, params: (string | number | null)[] = []) =>
      db.prepare(sql).all(...params) as T[],
    batch: async (statements) => {
      db.exec("BEGIN");
      try {
        for (const { sql, params = [] } of statements) db.prepare(sql).run(...params);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => db.close(),
  };
}
