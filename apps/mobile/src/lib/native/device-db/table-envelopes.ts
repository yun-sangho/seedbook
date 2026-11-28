import {
  ACCOUNT_SNAPSHOT_STORAGE_KEY,
  HOLDINGS_HISTORY_STORAGE_KEY,
  type HoldingsEntry,
} from "@mobile/features/investments/utils/account-value-history";
import {
  type AccountSnapshotPayload,
  isDateString,
  parseSnapshotPayloads,
} from "@seedbook/domain/v1/account-snapshot-record";
import type { SqlDriver, SqlStatement } from "./sql-driver";

/**
 * 계좌 총액 일별 기록 envelope (`{ state, version }`) ↔ 기기 SQLite 테이블
 * (`investment_account_snapshot`·`investment_holding_history`). 레코드가 아닌 기기 상태다 — 자산은
 * `records` (`record-store.ts`), 계정 설정은 `settings-envelope.ts`, 그 밖은 `device_kv`.
 */

const TABLE_ENVELOPE_KEYS = [ACCOUNT_SNAPSHOT_STORAGE_KEY, HOLDINGS_HISTORY_STORAGE_KEY];

/** `account-value-history-storage.ts` 의 persist version 과 같다. */
const ACCOUNT_SNAPSHOT_VERSION = 1;
const HOLDINGS_HISTORY_VERSION = 1;

export function isTableEnvelopeKey(key: string): boolean {
  return TABLE_ENVELOPE_KEYS.includes(key);
}

type State = Record<string, unknown>;

function parseEnvelopeState(value: string): State | null {
  try {
    const parsed = JSON.parse(value) as { state?: unknown };
    return parsed && typeof parsed.state === "object" && parsed.state !== null
      ? (parsed.state as State)
      : null;
  } catch {
    return null;
  }
}

function serialize(state: State, version: number): string {
  return JSON.stringify({ state, version });
}

const nowIso = () => new Date().toISOString();

function parseJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

// ─── account-snapshot-storage · holdings-history-storage ────────────────────

async function readAccountSnapshots(driver: SqlDriver): Promise<string | null> {
  const rows = await driver.query<AccountSnapshotPayload>(
    `SELECT accountId, date, stockValue, cashValue, totalValue, holdingCount, missingPriceCount,
            oldestPriceDate
     FROM investment_account_snapshot ORDER BY date, accountId`
  );
  if (rows.length === 0) return null;
  return serialize({ snapshots: rows }, ACCOUNT_SNAPSHOT_VERSION);
}

async function accountSnapshotStatements(driver: SqlDriver, state: State): Promise<SqlStatement[]> {
  const snapshots = parseSnapshotPayloads(state.snapshots) ?? [];
  const existing = await driver.query<{ accountId: string; date: string; createdAt: string }>(
    "SELECT accountId, date, createdAt FROM investment_account_snapshot"
  );
  const createdAt = new Map(existing.map((r) => [`${r.accountId}|${r.date}`, r.createdAt]));
  const now = nowIso();
  const statements: SqlStatement[] = [{ sql: "DELETE FROM investment_account_snapshot" }];
  for (const s of snapshots) {
    statements.push({
      sql: `INSERT OR REPLACE INTO investment_account_snapshot (accountId, date, stockValue, cashValue,
              totalValue, holdingCount, missingPriceCount, oldestPriceDate, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        s.accountId,
        s.date,
        s.stockValue,
        s.cashValue,
        s.totalValue,
        s.holdingCount,
        s.missingPriceCount,
        s.oldestPriceDate,
        createdAt.get(`${s.accountId}|${s.date}`) ?? now,
        now,
      ],
    });
  }
  return statements;
}

async function readHoldingsHistory(driver: SqlDriver): Promise<string | null> {
  const rows = await driver.query<{ date: string; accounts: string | null }>(
    "SELECT date, accounts FROM investment_holding_history ORDER BY date"
  );
  if (rows.length === 0) return null;
  const entries: HoldingsEntry[] = rows.map((r) => ({
    date: r.date,
    accounts: r.accounts === null ? null : (parseJson(r.accounts) as HoldingsEntry["accounts"]),
  }));
  return serialize({ entries }, HOLDINGS_HISTORY_VERSION);
}

function holdingsHistoryStatements(state: State): SqlStatement[] {
  const raw = Array.isArray(state.entries) ? (state.entries as unknown[]) : [];
  const statements: SqlStatement[] = [{ sql: "DELETE FROM investment_holding_history" }];
  for (const item of raw) {
    const entry = item as Partial<HoldingsEntry> | null;
    if (!entry || !isDateString(entry.date)) continue;
    const accounts = typeof entry.accounts === "object" ? entry.accounts : undefined;
    if (accounts === undefined) continue;
    statements.push({
      sql: "INSERT OR REPLACE INTO investment_holding_history (date, accounts) VALUES (?, ?)",
      params: [entry.date, accounts === null ? null : JSON.stringify(accounts)],
    });
  }
  return statements;
}

// ─── public API ─────────────────────────────────────────────────────────────

/** 테이블에서 envelope 를 조립한다. 저장된 것이 없으면 null. */
export async function readTableEnvelope(driver: SqlDriver, key: string): Promise<string | null> {
  if (key === ACCOUNT_SNAPSHOT_STORAGE_KEY) return readAccountSnapshots(driver);
  if (key === HOLDINGS_HISTORY_STORAGE_KEY) return readHoldingsHistory(driver);
  return null;
}

/** envelope 를 테이블 행으로 나눠 한 트랜잭션으로 저장한다. envelope 가 아니면 무시한다. */
export async function writeTableEnvelope(
  driver: SqlDriver,
  key: string,
  value: string
): Promise<void> {
  const state = parseEnvelopeState(value);
  if (!state) return;
  let statements: SqlStatement[] = [];
  if (key === ACCOUNT_SNAPSHOT_STORAGE_KEY) {
    statements = await accountSnapshotStatements(driver, state);
  } else if (key === HOLDINGS_HISTORY_STORAGE_KEY) statements = holdingsHistoryStatements(state);
  if (statements.length > 0) await driver.batch(statements);
}

/** envelope 하나를 지운다 (persist 의 removeItem). */
export async function removeTableEnvelope(driver: SqlDriver, key: string): Promise<void> {
  if (key === ACCOUNT_SNAPSHOT_STORAGE_KEY) {
    await driver.batch([{ sql: "DELETE FROM investment_account_snapshot" }]);
  } else if (key === HOLDINGS_HISTORY_STORAGE_KEY) {
    await driver.batch([{ sql: "DELETE FROM investment_holding_history" }]);
  }
}

/** 기기 표·설정·기기 상태를 모두 비운다 (회원 탈퇴). 레코드는 `clearRecords`. */
export async function clearDeviceTables(driver: SqlDriver): Promise<void> {
  await driver.batch(
    [
      "investment_account_snapshot",
      "investment_holding_history",
      "user_preference",
      "device_kv",
    ].map((table) => ({ sql: `DELETE FROM ${table}` }))
  );
}
