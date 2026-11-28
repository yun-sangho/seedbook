import type { SqlDriver } from "./sql-driver";

/**
 * 기기 SQLite 스키마. 이미 나간 버전은 고치지 않고 새 버전을 **추가**한다.
 *
 * - **버전 7 부터 자산은 `records` 레코드 JSON 테이블 하나**에 둔다 (설계 §2.5, `record-store.ts`).
 *   레코드 필드가 늘어도 기기 마이그레이션은 없다 — 여기에 새 버전을 더하는 것은 `records`·이력·
 *   outbox 같은 저장 틀이 바뀔 때뿐이다.
 * - 버전 1~6 의 자산 테이블(서버 Postgres 와 같은 모양)·`user_list_order`·`device_quarantine` 은
 *   버전 8 이 지운다 (동기화 v2-5). 버전 1~6 의 문장은 이미 나간 기록이라 그대로 둔다.
 *   계좌 총액 기록(`investment_account_snapshot`·`investment_holding_history`), 저장소 모드
 *   (`user_preference.storageMode`), `device_kv` 는 계속 쓴다 (레코드가 아닌 기기 상태).
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
  {
    version: 3,
    statements: [
      // local 모드 계좌 총액 일별 기록. 서버와 달리 계좌를 지워도 남긴다 (서버는 계좌를 소프트 삭제).
      `CREATE TABLE investment_account_snapshot (
        accountId TEXT NOT NULL,
        date TEXT NOT NULL,
        stockValue INTEGER NOT NULL,
        cashValue INTEGER NOT NULL,
        totalValue INTEGER NOT NULL,
        holdingCount INTEGER NOT NULL,
        missingPriceCount INTEGER NOT NULL,
        oldestPriceDate TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (accountId, date)
      )`,
      // 기기에만 있는 표: 보유 종목·현금이 바뀐 날마다 그 날의 계좌별 보유 내역 (JSON).
      // accounts 가 NULL 이면 그 날부터 기록 중단 (cloud 모드).
      `CREATE TABLE investment_holding_history (
        date TEXT PRIMARY KEY NOT NULL,
        accounts TEXT
      )`,
    ],
  },
  {
    version: 4,
    statements: [
      // 포트폴리오 식물: 지금 목표 금액, 도달 단계 (0~4), 달성한 목표 이력 (JSON).
      "ALTER TABLE portfolio ADD COLUMN goalAmount INTEGER",
      "ALTER TABLE portfolio ADD COLUMN growthStage INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE portfolio ADD COLUMN goalHistory TEXT NOT NULL DEFAULT '[]'",
    ],
  },
  {
    version: 5,
    statements: [
      // 기기에만 있는 표: 검증에 실패해 자산 테이블에 쓰지 못한 항목의 원본 (store key 별 항목마다
      // 마지막 하나). local 모드에서 기기는 유일한 사본이라 지우지 않고 여기에 남긴다.
      `CREATE TABLE device_quarantine (
        storageKey TEXT NOT NULL,
        itemId TEXT NOT NULL,
        item TEXT NOT NULL,
        quarantinedAt TEXT NOT NULL,
        PRIMARY KEY (storageKey, itemId)
      )`,
    ],
  },
  {
    version: 6,
    statements: [
      // 계정에 저장하는 화면 설정: 계좌 목록 정렬, 포트폴리오 종목 정렬, 투자 추이 기간.
      "ALTER TABLE user_preference ADD COLUMN accountSortOption TEXT NOT NULL DEFAULT 'evalDesc'",
      "ALTER TABLE user_preference ADD COLUMN portfolioStockSortOption TEXT NOT NULL DEFAULT 'driftDesc'",
      "ALTER TABLE user_preference ADD COLUMN investmentTrendRange TEXT NOT NULL DEFAULT '3months'",
    ],
  },
  {
    version: 7,
    statements: [
      // 동기화 레코드 (설계 §2.5 · §5.7). data 는 정규 JSON (`canonicalStringify`), checksum 은 그
      // 문자열의 SHA-256. JS 가 실수해도 깨진 JSON·빈 체크섬은 SQLite 가 거부한다.
      // 삭제는 행을 지우지 않고 deletedAt 을 찍는다 (톰스톤).
      `CREATE TABLE records (
        type TEXT NOT NULL,
        id TEXT NOT NULL,
        parentId TEXT,
        data TEXT NOT NULL CHECK (json_valid(data)),
        checksum TEXT NOT NULL CHECK (length(checksum) = 64 AND checksum NOT GLOB '*[^0-9a-f]*'),
        schemaVersion INTEGER NOT NULL,
        writtenBy TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        changeSeq INTEGER,
        deletedAt TEXT,
        sortKey TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (type, id)
      )`,
      "CREATE INDEX records_parent_idx ON records (type, parentId)",
      // 덮어쓰기 직전 값. 레코드마다 최근 3개 (읽기에서 손상을 만나면 여기서 복구한다).
      `CREATE TABLE records_history (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        id TEXT NOT NULL,
        parentId TEXT,
        data TEXT NOT NULL CHECK (json_valid(data)),
        checksum TEXT NOT NULL CHECK (length(checksum) = 64),
        schemaVersion INTEGER NOT NULL,
        writtenBy TEXT NOT NULL,
        deletedAt TEXT,
        sortKey TEXT,
        savedAt TEXT NOT NULL
      )`,
      "CREATE INDEX records_history_record_idx ON records_history (type, id, seq)",
      // 쓰지 못한 값(필드 검증 실패·직렬화 실패)과 읽지 못한 행(체크섬·검증 실패)의 원본.
      // value 는 깨진 값일 수 있어 JSON 제약을 두지 않는다. 같은 자리는 마지막 것 하나.
      // device_quarantine (버전 5) 의 항목은 옮겨 왔고(source = 'legacy') 그 표는 버전 8 이 지운다.
      `CREATE TABLE records_quarantine (
        type TEXT NOT NULL,
        id TEXT NOT NULL,
        field TEXT NOT NULL,
        source TEXT NOT NULL,
        code TEXT NOT NULL,
        value TEXT,
        checksum TEXT,
        at TEXT NOT NULL,
        PRIMARY KEY (type, id, field, source)
      )`,
      // v2-4b 동기화 엔진의 자리 (설계 §5.1~5.2). 이 버전에서는 만들기만 한다.
      `CREATE TABLE sync_outbox (
        type TEXT NOT NULL,
        id TEXT NOT NULL,
        op TEXT NOT NULL,
        fields TEXT NOT NULL CHECK (json_valid(fields)),
        seq INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (type, id)
      )`,
      `CREATE TABLE sync_shadow (
        type TEXT NOT NULL,
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        changeSeq INTEGER,
        fields TEXT NOT NULL CHECK (json_valid(fields)),
        sortKey TEXT,
        PRIMARY KEY (type, id)
      )`,
      // 저장소 자체의 상태 (레코드 이전 여부, 마지막 스냅샷 시각, 마지막 무결성 검사).
      `CREATE TABLE device_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 8,
    statements: [
      // 동기화 v2-5 (contract): 레코드로 옮긴 옛 자산 표·목록 순서·옛 격리 표를 지운다. 자식 표부터.
      "DROP TABLE IF EXISTS investment_record",
      "DROP TABLE IF EXISTS stock_holding",
      "DROP TABLE IF EXISTS cash_item",
      "DROP TABLE IF EXISTS portfolio_allocation",
      "DROP TABLE IF EXISTS rebalancing",
      "DROP TABLE IF EXISTS investment_account",
      "DROP TABLE IF EXISTS portfolio",
      "DROP TABLE IF EXISTS user_list_order",
      "DROP TABLE IF EXISTS device_quarantine",
    ],
  },
];

const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS device_schema_migration (
  version INTEGER PRIMARY KEY NOT NULL,
  appliedAt TEXT NOT NULL
)`;

export interface MigrateOptions {
  /**
   * 적용할 버전이 있고 이미 쓰던 데이터베이스일 때(처음 만드는 것이 아닐 때) 적용 직전에 부른다.
   * 저장 틀을 바꾸기 전 스냅샷을 남기는 자리다 (설계 §5.7.4). 실패하면 마이그레이션도 하지 않는다.
   */
  beforeMigrate?: (pending: number[]) => Promise<void>;
}

/** 아직 적용하지 않은 버전을 순서대로 적용한다. 버전마다 한 트랜잭션. */
export async function migrateDeviceDatabase(
  driver: SqlDriver,
  migrations: DeviceMigration[] = DEVICE_MIGRATIONS,
  options: MigrateOptions = {}
): Promise<void> {
  await driver.batch([{ sql: CREATE_MIGRATIONS_TABLE }]);
  const applied = await driver.query<{ version: number }>(
    "SELECT version FROM device_schema_migration"
  );
  const done = new Set(applied.map((row) => Number(row.version)));
  const pending = migrations
    .filter((m) => !done.has(m.version))
    .sort((a, b) => a.version - b.version);
  if (pending.length > 0 && done.size > 0 && options.beforeMigrate) {
    await options.beforeMigrate(pending.map((m) => m.version));
  }
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
