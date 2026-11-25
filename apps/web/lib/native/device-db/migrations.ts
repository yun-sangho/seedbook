import type { SqlDriver } from "./sql-driver";

/**
 * 기기 SQLite 스키마. 자산 테이블은 서버 Postgres (`packages/database/src/schema.ts`) 와
 * 테이블·컬럼 이름이 같다. 기기에는 한 사람의 데이터만 있어 `userId` 와 동기화 컬럼
 * (`version`, `deletedAt`) 은 두지 않는다 — `migrations.test.ts` 가 서버 스키마와 비교한다.
 *
 * 타입 대응: uuid/text → TEXT, bigint/integer → INTEGER, double → REAL,
 * date → TEXT (YYYY-MM-DD), timestamp → TEXT (ISO 8601), jsonb·배열 → TEXT (JSON).
 *
 * 서버 스키마가 바뀌면 여기에 새 버전을 **추가**한다 (이미 나간 버전은 고치지 않는다).
 */
export interface DeviceMigration {
  version: number;
  statements: string[];
}

export const DEVICE_MIGRATIONS: DeviceMigration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE investment_account (
        id TEXT PRIMARY KEY NOT NULL,
        accountName TEXT NOT NULL,
        accountType TEXT NOT NULL,
        currency TEXT NOT NULL,
        initialInvestment INTEGER NOT NULL,
        currentValue INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL,
        sellCostPercent REAL NOT NULL DEFAULT 0,
        portfolioId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
      `CREATE TABLE investment_record (
        accountId TEXT NOT NULL REFERENCES investment_account(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        initialInvestment INTEGER NOT NULL,
        currentValue INTEGER NOT NULL,
        PRIMARY KEY (accountId, date)
      )`,
      `CREATE TABLE stock_holding (
        id TEXT PRIMARY KEY NOT NULL,
        accountId TEXT NOT NULL REFERENCES investment_account(id) ON DELETE CASCADE,
        market TEXT NOT NULL,
        ticker TEXT NOT NULL,
        name TEXT NOT NULL,
        currency TEXT NOT NULL,
        quantity REAL NOT NULL,
        memo TEXT NOT NULL DEFAULT ''
      )`,
      "CREATE INDEX stock_holding_accountId_idx ON stock_holding (accountId)",
      `CREATE TABLE cash_item (
        id TEXT PRIMARY KEY NOT NULL,
        accountId TEXT NOT NULL REFERENCES investment_account(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        amount INTEGER NOT NULL
      )`,
      "CREATE INDEX cash_item_accountId_idx ON cash_item (accountId)",
      `CREATE TABLE portfolio (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        accountIds TEXT NOT NULL DEFAULT '[]',
        driftMode TEXT NOT NULL DEFAULT 'absolute',
        driftThresholdPercent REAL NOT NULL DEFAULT 5,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
      `CREATE TABLE portfolio_allocation (
        id TEXT PRIMARY KEY NOT NULL,
        portfolioId TEXT NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
        market TEXT NOT NULL,
        ticker TEXT NOT NULL,
        name TEXT NOT NULL,
        currency TEXT NOT NULL,
        targetPercent REAL NOT NULL
      )`,
      "CREATE INDEX portfolio_allocation_portfolioId_idx ON portfolio_allocation (portfolioId)",
      `CREATE TABLE rebalancing (
        id TEXT PRIMARY KEY NOT NULL,
        accountId TEXT NOT NULL,
        accountName TEXT NOT NULL,
        portfolioId TEXT NOT NULL,
        portfolioName TEXT NOT NULL,
        cashDelta INTEGER NOT NULL,
        tasks TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        completedAt TEXT,
        result TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
      `CREATE TABLE user_preference (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        holdingsSortOption TEXT NOT NULL DEFAULT 'evalDesc',
        rebalancingTaskSort TEXT NOT NULL DEFAULT 'nameDesc',
        rebalancingCollapsedSections TEXT NOT NULL DEFAULT '[]',
        storageMode TEXT NOT NULL DEFAULT 'local'
      )`,
      `CREATE TABLE user_list_order (
        domain TEXT PRIMARY KEY NOT NULL,
        "order" TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
      // 서버에 없는 기기 상태 (시세 캐시, 동기화 대기열, 화면 설정 등).
      `CREATE TABLE device_kv (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    statements: ["ALTER TABLE user_preference ADD COLUMN storageModeChosenAt TEXT"],
  },
];

const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS device_schema_migration (
  version INTEGER PRIMARY KEY NOT NULL,
  appliedAt TEXT NOT NULL
)`;

/** 아직 적용하지 않은 버전을 순서대로 적용한다. 버전마다 한 트랜잭션. */
export async function migrateDeviceDatabase(
  driver: SqlDriver,
  migrations: DeviceMigration[] = DEVICE_MIGRATIONS
): Promise<void> {
  await driver.batch([{ sql: CREATE_MIGRATIONS_TABLE }]);
  const applied = await driver.query<{ version: number }>(
    "SELECT version FROM device_schema_migration"
  );
  const done = new Set(applied.map((row) => Number(row.version)));
  const pending = migrations
    .filter((m) => !done.has(m.version))
    .sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    await driver.batch([
      ...migration.statements.map((sql) => ({ sql })),
      {
        sql: "INSERT INTO device_schema_migration (version, appliedAt) VALUES (?, ?)",
        params: [migration.version, new Date().toISOString()],
      },
    ]);
  }
}
