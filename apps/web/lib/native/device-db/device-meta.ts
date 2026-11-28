import type { SqlDriver, SqlStatement } from "./sql-driver";

/** 저장소 자체의 상태 (`device_meta`): 레코드 이전, 스냅샷, 무결성 검사. */
export const META_RECORDS_MIGRATED_AT = "records.migratedAt";
export const META_RECORDS_MIGRATION_FAILURE = "records.migrationFailure";
export const META_LAST_SNAPSHOT_AT = "snapshot.lastAt";
export const META_LAST_QUICK_CHECK = "integrity.lastQuickCheck";

export async function readMeta(driver: SqlDriver, key: string): Promise<string | null> {
  const [row] = await driver.query<{ value: string }>(
    "SELECT value FROM device_meta WHERE key = ?",
    [key]
  );
  return row?.value ?? null;
}

export function metaStatement(key: string, value: string | null): SqlStatement {
  if (value === null) return { sql: "DELETE FROM device_meta WHERE key = ?", params: [key] };
  return {
    sql: `INSERT INTO device_meta (key, value, updatedAt) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    params: [key, value, new Date().toISOString()],
  };
}

export async function writeMeta(
  driver: SqlDriver,
  key: string,
  value: string | null
): Promise<void> {
  await driver.batch([metaStatement(key, value)]);
}
