import {
  META_RECORDS_MIGRATED_AT,
  META_RECORDS_MIGRATION_FAILURE,
  metaStatement,
  readMeta,
} from "./device-meta";
import {
  INVESTMENT_KEY,
  PORTFOLIO_KEY,
  REBALANCING_KEY,
  RECORD_ENVELOPE_KEYS,
  recordEnvelopeWrites,
} from "./record-envelopes";
import {
  clearRecords,
  prepareRecordWrites,
  type RecordWrite,
  readRecords,
  verifyStoredRow,
} from "./record-store";
import type { SqlDriver } from "./sql-driver";
import { readTableEnvelope } from "./table-envelopes";

/**
 * 옛 자산 테이블(서버 컬럼을 따른 표, 마이그레이션 1~6) → `records` 이전 (설계 §5.7.4).
 *
 *   1. 옛 테이블에서 envelope 를 조립(`readTableEnvelope`)하고 레코드 쓰기로 나눈다.
 *   2. `records` 에 한 트랜잭션으로 쓰고, 같은 트랜잭션에서 "이전 완료" 를 기록한다.
 *   3. 행 수·체크섬·정의 검증을 다시 한다. 하나라도 어긋나면 `records` 를 비우고 "이전 완료" 를
 *      지운다 → 이 기기는 옛 테이블을 계속 쓰고, 다음 실행에서 다시 시도한다.
 *
 * 옛 테이블은 지우지 않는다 (v2-5 에서 정리). `device_quarantine` (#91) 의 격리 항목은
 * `records_quarantine` 으로 옮긴다 (source = `legacy`) — 옛 표는 더 쓰지 않는다.
 */

export type RecordsMigrationResult =
  | { status: "already" }
  | { status: "done"; records: number; quarantined: number }
  | { status: "failed"; reason: string };

const QUARANTINE_TYPE_BY_KEY: Record<string, string> = {
  [INVESTMENT_KEY]: "account",
  [PORTFOLIO_KEY]: "portfolio",
  [REBALANCING_KEY]: "rebalancing",
};

async function legacyQuarantineWrites(driver: SqlDriver): Promise<RecordWrite[]> {
  const rows = await driver.query<{ storageKey: string; itemId: string; item: string }>(
    "SELECT storageKey, itemId, item FROM device_quarantine ORDER BY quarantinedAt, rowid"
  );
  return rows.map((row) => ({
    op: "quarantine",
    type: QUARANTINE_TYPE_BY_KEY[row.storageKey] ?? row.storageKey,
    id: row.itemId,
    code: "legacy",
    value: row.item,
    source: "legacy",
  }));
}

/**
 * 옛 테이블에서 레코드 쓰기를 만든다. 포트폴리오 연결(`account.portfolioId`)은 레코드가 아직 없어
 * 어댑터가 계산하지 못하므로 포트폴리오 envelope 의 `accountIds` 로 계좌 쓰기에 채운다.
 */
async function legacyWrites(driver: SqlDriver): Promise<RecordWrite[]> {
  const writes: RecordWrite[] = [];
  const owner = new Map<string, string>();
  for (const key of RECORD_ENVELOPE_KEYS) {
    const envelope = await readTableEnvelope(driver, key);
    if (envelope === null) continue;
    if (key === PORTFOLIO_KEY) {
      const portfolios = (JSON.parse(envelope) as { state: { portfolios: unknown[] } }).state
        .portfolios as Array<{ id: string; accountIds: string[] }>;
      for (const p of portfolios) for (const accountId of p.accountIds) owner.set(accountId, p.id);
    }
    writes.push(...(await recordEnvelopeWrites(driver, key, envelope)));
  }
  return writes.map((write) =>
    write.op === "put" && write.type === "account"
      ? { ...write, fields: { ...write.fields, portfolioId: owner.get(write.id) ?? null } }
      : write
  );
}

async function verify(driver: SqlDriver, expected: number): Promise<string | null> {
  const [row] = await driver.query<{ count: number }>("SELECT COUNT(*) AS count FROM records");
  const count = row?.count ?? 0;
  if (Number(count) !== expected) return `row count ${count} != ${expected}`;
  const rows = await driver.query<{
    type: string;
    parentId: string | null;
    data: string;
    checksum: string;
    schemaVersion: number;
    writtenBy: string;
    deletedAt: string | null;
    sortKey: string | null;
  }>("SELECT * FROM records");
  for (const row of rows) {
    const verified = await verifyStoredRow(row.type, row);
    if (!verified.ok) return `${row.type}: ${verified.code}`;
  }
  const types = [...new Set(rows.map((r) => r.type))];
  const { records, quarantined } = await readRecords(driver, { types, includeDeleted: true });
  if (quarantined.length > 0 || records.length !== expected) return "read back mismatch";
  return null;
}

/** 아직 옮기지 않았으면 옛 테이블을 `records` 로 옮긴다. 던지지 않는다. */
export async function migrateTablesToRecords(
  driver: SqlDriver,
  options: { writtenBy: string }
): Promise<RecordsMigrationResult> {
  try {
    if (await readMeta(driver, META_RECORDS_MIGRATED_AT)) return { status: "already" };
    // 지난 시도가 남긴 것이 있으면 비우고 처음부터 (이전 완료 기록이 없으면 records 는 쓰이지 않았다).
    await clearRecords(driver);

    const writes = [...(await legacyWrites(driver)), ...(await legacyQuarantineWrites(driver))];
    const { statements, outcome } = await prepareRecordWrites(driver, writes, options);
    await driver.batch([
      ...statements,
      metaStatement(META_RECORDS_MIGRATED_AT, new Date().toISOString()),
      metaStatement(META_RECORDS_MIGRATION_FAILURE, null),
    ]);

    const problem = await verify(driver, outcome.written);
    if (problem) throw new Error(`verification failed: ${problem}`);
    return { status: "done", records: outcome.written, quarantined: outcome.quarantined.length };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn("[device-db] 레코드 이전 실패 — 옛 테이블을 계속 쓴다", reason);
    try {
      await clearRecords(driver);
      await driver.batch([
        metaStatement(META_RECORDS_MIGRATED_AT, null),
        metaStatement(
          META_RECORDS_MIGRATION_FAILURE,
          JSON.stringify({ at: new Date().toISOString(), reason })
        ),
      ]);
    } catch {
      // 되돌리기도 실패하면 이전 완료 기록이 남았을 수 있다 — 아래 확인이 막는다.
    }
    return { status: "failed", reason };
  }
}

/** 이 기기가 `records` 를 쓰는지 (이전을 마쳤는지). */
export async function usesRecords(driver: SqlDriver): Promise<boolean> {
  return (await readMeta(driver, META_RECORDS_MIGRATED_AT)) !== null;
}
