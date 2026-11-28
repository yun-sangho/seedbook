import { META_LAST_QUICK_CHECK, META_LAST_SNAPSHOT_AT, readMeta, writeMeta } from "./device-meta";
import type { SqlDriver, SqlValue } from "./sql-driver";

/**
 * JS 밖의 장치 (설계 §5.7.3): 시작할 때 `PRAGMA quick_check`, 하루 1회·저장 틀 마이그레이션·OTA 번들 교체 직전에
 * `records` 전체를 별도 SQLite 파일(스냅샷)로 복사해 최근 7개를 보관한다. 번들 버그로 많은 행이
 * 망가져도 되돌릴 수 있게 한다.
 */

export const SNAPSHOTS_TO_KEEP = 7;

export interface QuickCheckResult {
  ok: boolean;
  /** `ok` 가 아니면 SQLite 가 알려 준 문제 (최대 몇 줄). */
  messages: string[];
}

/** 파일 수준 손상 검사. 결과는 `device_meta` 에도 남긴다. 검사 자체가 실패해도 던지지 않는다. */
export async function runQuickCheck(driver: SqlDriver): Promise<QuickCheckResult> {
  let result: QuickCheckResult;
  try {
    const rows = await driver.query<Record<string, SqlValue>>("PRAGMA quick_check");
    const messages = rows.map((row) => String(Object.values(row)[0]));
    result = { ok: messages.length === 1 && messages[0] === "ok", messages: messages.slice(0, 5) };
  } catch (error) {
    result = { ok: false, messages: [String(error)] };
  }
  if (!result.ok) console.warn("[device-db] PRAGMA quick_check 실패", result.messages);
  try {
    await writeMeta(
      driver,
      META_LAST_QUICK_CHECK,
      JSON.stringify({ at: new Date().toISOString(), ...result })
    );
  } catch {
    // 기록하지 못해도 시작은 계속한다.
  }
  return result;
}

/** 스냅샷에 담는 `records` 행 (컬럼 그대로). */
export type SnapshotRow = Record<string, SqlValue>;

/**
 * 스냅샷 파일 보관소. 앱은 SQLite 데이터베이스 파일 하나씩 (`capacitor-driver.ts`), 브라우저 개발
 * 환경은 IndexedDB (`sqljs-driver.ts`), 테스트는 메모리.
 */
export interface DeviceSnapshotStore {
  /** 보관 중인 스냅샷 이름. */
  list: () => Promise<string[]>;
  save: (name: string, rows: SnapshotRow[]) => Promise<void>;
  read: (name: string) => Promise<SnapshotRow[]>;
  remove: (name: string) => Promise<void>;
}

/** 스냅샷 파일의 `records` 테이블 (본 테이블과 같은 컬럼·제약). */
export const SNAPSHOT_RECORDS_TABLE = `CREATE TABLE IF NOT EXISTS records (
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  parentId TEXT,
  data TEXT NOT NULL CHECK (json_valid(data)),
  checksum TEXT NOT NULL CHECK (length(checksum) = 64),
  schemaVersion INTEGER NOT NULL,
  writtenBy TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  changeSeq INTEGER,
  deletedAt TEXT,
  sortKey TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (type, id)
)`;

export const SNAPSHOT_COLUMNS = [
  "type",
  "id",
  "parentId",
  "data",
  "checksum",
  "schemaVersion",
  "writtenBy",
  "version",
  "changeSeq",
  "deletedAt",
  "sortKey",
  "createdAt",
  "updatedAt",
] as const;

/** 스냅샷 이름의 접두사. 이름은 시각 순으로 정렬된다 (데이터베이스 이름에 쓸 수 있는 글자만). */
export const SNAPSHOT_PREFIX = "seedbooksnap";

/** `update`: OTA 번들을 바꾸기 직전 (`lib/native/live-update.ts`). */
export type SnapshotReason = "daily" | "migration" | "update";

export function snapshotName(at: Date, reason: SnapshotReason): string {
  const stamp = at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "");
  return `${SNAPSHOT_PREFIX}${stamp}${reason}`;
}

async function hasRecordsTable(driver: SqlDriver): Promise<boolean> {
  const rows = await driver.query(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'records'"
  );
  return rows.length > 0;
}

/**
 * `records` 전체를 스냅샷으로 남기고, 오래된 것은 최근 {@link SNAPSHOTS_TO_KEEP} 개만 남긴다.
 * `records` 가 아직 없는 데이터베이스(첫 레코드 마이그레이션 전)면 아무것도 하지 않는다 — 그때는
 * 옛 자산 테이블이 그대로 남아 있다.
 */
export async function takeSnapshot(
  driver: SqlDriver,
  store: DeviceSnapshotStore,
  reason: SnapshotReason,
  at: Date = new Date()
): Promise<string | null> {
  if (!(await hasRecordsTable(driver))) return null;
  const rows = await driver.query<SnapshotRow>(
    `SELECT ${SNAPSHOT_COLUMNS.join(", ")} FROM records ORDER BY type, id`
  );
  const name = snapshotName(at, reason);
  await store.save(name, rows);
  const names = (await store.list()).filter((n) => n.startsWith(SNAPSHOT_PREFIX)).sort();
  for (const old of names.slice(0, Math.max(0, names.length - SNAPSHOTS_TO_KEEP))) {
    await store.remove(old);
  }
  // 마이그레이션 직전 스냅샷은 device_meta 가 아직 없을 수 있다 (그 테이블도 같은 버전에서 생겼다).
  if (reason === "daily") await writeMeta(driver, META_LAST_SNAPSHOT_AT, at.toISOString());
  return name;
}

/** 오늘(UTC) 스냅샷이 없으면 남긴다. */
export async function ensureDailySnapshot(
  driver: SqlDriver,
  store: DeviceSnapshotStore,
  now: Date = new Date()
): Promise<string | null> {
  const last = await readMeta(driver, META_LAST_SNAPSHOT_AT);
  if (last && last.slice(0, 10) === now.toISOString().slice(0, 10)) return null;
  return takeSnapshot(driver, store, "daily", now);
}
