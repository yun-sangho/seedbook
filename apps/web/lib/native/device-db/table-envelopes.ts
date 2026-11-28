import { formatDate } from "@web/app/api/storage/_translators/types";
import {
  ACCOUNT_SNAPSHOT_STORAGE_KEY,
  HOLDINGS_HISTORY_STORAGE_KEY,
  type HoldingsEntry,
} from "@web/features/investments/utils/account-value-history";
import { INITIAL_PLANT_PROGRESS } from "@web/features/portfolio/types/constants";
import { dedupePortfolioLinks } from "@web/features/portfolio/utils/portfolio-links";
import { readPlantProgress } from "@web/features/portfolio/utils/portfolio-plant";
import {
  type AccountSnapshotPayload,
  isDateString,
  parseSnapshotPayloads,
} from "@web/server/account-snapshots/account-snapshot-record";
import {
  investmentChildRows,
  investmentFieldsToColumns,
  investmentRowToFields,
  parseInvestmentFields,
} from "@web/server/investments/investment-record";
import {
  parsePortfolioFields,
  portfolioAllocationRows,
  portfolioFieldsToColumns,
  portfolioRowToData,
} from "@web/server/portfolio/portfolio-record";
import {
  parseRebalancingFields,
  rebalancingPayloadToColumns,
  rebalancingRowToPayload,
} from "@web/server/rebalancing/rebalancing-record";
import type { SqlDriver, SqlStatement, SqlValue } from "./sql-driver";

/**
 * Zustand persist envelope (`{ state, version }`) ↔ 기기 SQLite 테이블.
 *
 * 서버 envelope 번역기 (`app/api/storage/_translators`) 의 기기판이다. 검증·행 변환은 서버와
 * 같은 함수(`server/<domain>/*-record.ts`)를 쓰고, 목록 순서는 서버처럼 `user_list_order` 에
 * 둔다. 읽을 때 돌려주는 `version` 도 서버 번역기와 같아 store 의 `migrate` 가 같은 경로로
 * 정리한다.
 *
 * local 모드에서 기기는 유일한 사본이다. 서버가 거부할 항목(모양이 틀린 계좌 등)은 테이블에 쓰지
 * 않지만 **지우지도 않는다** — 테이블의 마지막 저장본을 그대로 두고, store 가 넘긴 원본은
 * `device_quarantine` 에 격리한다. 테이블에서 지우는 것은 목록에서 빠진 항목(사용자의 삭제)뿐이다.
 */

const INVESTMENT_KEY = "investment-storage";
const PORTFOLIO_KEY = "portfolio-storage";
const REBALANCING_KEY = "rebalancing-storage";
const PREFERENCES_KEY = "seedbook.preferences";

const TABLE_ENVELOPE_KEYS = [
  INVESTMENT_KEY,
  PORTFOLIO_KEY,
  REBALANCING_KEY,
  PREFERENCES_KEY,
  ACCOUNT_SNAPSHOT_STORAGE_KEY,
  HOLDINGS_HISTORY_STORAGE_KEY,
];

/** 서버 번역기의 envelope version 과 같다. */
const INVESTMENT_VERSION = 4;
const PORTFOLIO_VERSION = 3;
const REBALANCING_VERSION = 1;
const PREFERENCES_VERSION = 1;
/** 계좌 총액 기록은 기기에만 envelope 로 둔다 (`account-value-history-storage.ts` 와 같은 version). */
const ACCOUNT_SNAPSHOT_VERSION = 1;
const HOLDINGS_HISTORY_VERSION = 1;

/** `user_list_order.domain` — 서버 번역기와 같은 이름. */
const INVESTMENT_LIST = "investment-accounts";
const PORTFOLIO_LIST = "portfolios";
const REBALANCING_LIST = "rebalancings";

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

function listOrderStatement(domain: string, order: string[]): SqlStatement {
  return {
    sql: `INSERT INTO user_list_order (domain, "order", updatedAt) VALUES (?, ?, ?)
          ON CONFLICT(domain) DO UPDATE SET "order" = excluded."order", updatedAt = excluded.updatedAt`,
    params: [domain, JSON.stringify(order), nowIso()],
  };
}

function preferenceStatement(columns: Record<string, SqlValue>): SqlStatement {
  const names = Object.keys(columns);
  return {
    sql: `INSERT INTO user_preference (id, ${names.join(", ")}) VALUES (1, ${names.map(() => "?").join(", ")})
          ON CONFLICT(id) DO UPDATE SET ${names.map((n) => `${n} = excluded.${n}`).join(", ")}`,
    params: Object.values(columns),
  };
}

/** `<column> NOT IN (...)` — 목록이 비면 전부. */
function deleteMissing(table: string, ids: string[], column = "id"): SqlStatement {
  if (ids.length === 0) return { sql: `DELETE FROM ${table}` };
  return {
    sql: `DELETE FROM ${table} WHERE ${column} NOT IN (${ids.map(() => "?").join(", ")})`,
    params: ids,
  };
}

/**
 * envelope 목록을 검증을 통과한 항목과 통과하지 못한 항목으로 나눈다. `ids` 는 id 가 있는 모든
 * 항목의 순서 — 목록 순서와 "남길 행" 의 기준이다 (검증 실패 항목도 지우지 않는다).
 */
function partitionItems<T, F>(
  raw: T[],
  parse: (item: T, id: string) => F | null
): {
  ids: string[];
  valid: Array<{ id: string; fields: F; item: T }>;
  invalid: Array<{ id: string; item: T }>;
} {
  const ids: string[] = [];
  const valid: Array<{ id: string; fields: F; item: T }> = [];
  const invalid: Array<{ id: string; item: T }> = [];
  for (const item of raw) {
    const id = (item as { id?: unknown } | null)?.id;
    // id 가 없으면 행과 짝지을 수 없다 — store 가 만든 항목에는 늘 id 가 있다.
    if (typeof id !== "string") continue;
    ids.push(id);
    const fields = parse(item, id);
    if (fields) valid.push({ id, fields, item });
    else invalid.push({ id, item });
  }
  return { ids, valid, invalid };
}

/**
 * 검증 실패 항목을 격리한다 (항목마다 마지막 원본 하나). 목록에서 빠진 항목(사용자가 지움)의
 * 격리본은 함께 지운다.
 */
function quarantineStatements(
  storageKey: string,
  ids: string[],
  invalid: Array<{ id: string; item: unknown }>
): SqlStatement[] {
  const now = nowIso();
  const statements: SqlStatement[] = [
    ids.length === 0
      ? { sql: "DELETE FROM device_quarantine WHERE storageKey = ?", params: [storageKey] }
      : {
          sql: `DELETE FROM device_quarantine WHERE storageKey = ? AND itemId NOT IN (${ids.map(() => "?").join(", ")})`,
          params: [storageKey, ...ids],
        },
  ];
  for (const { id, item } of invalid) {
    console.warn(`[device-db] ${storageKey}: 검증에 실패한 항목을 저장하지 않고 격리했다`, id);
    statements.push({
      sql: `INSERT OR REPLACE INTO device_quarantine (storageKey, itemId, item, quarantinedAt)
            VALUES (?, ?, ?, ?)`,
      params: [storageKey, id, JSON.stringify(item), now],
    });
  }
  return statements;
}

async function readListOrder(driver: SqlDriver, domain: string): Promise<string[] | null> {
  const [row] = await driver.query<{ order: string }>(
    `SELECT "order" FROM user_list_order WHERE domain = ?`,
    [domain]
  );
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.order) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function sortByOrder<T extends { id: string }>(rows: T[], order: string[] | null): T[] {
  const index = new Map((order ?? []).map((id, i) => [id, i]));
  const rank = (id: string) => index.get(id) ?? Number.MAX_SAFE_INTEGER;
  return rows.slice().sort((a, b) => rank(a.id) - rank(b.id));
}

async function readPreference(driver: SqlDriver) {
  const [row] = await driver.query<{
    holdingsSortOption: string;
    rebalancingTaskSort: string;
    rebalancingCollapsedSections: string;
    accountSortOption: string;
    portfolioStockSortOption: string;
    investmentTrendRange: string;
  }>(
    `SELECT holdingsSortOption, rebalancingTaskSort, rebalancingCollapsedSections,
            accountSortOption, portfolioStockSortOption, investmentTrendRange
       FROM user_preference WHERE id = 1`
  );
  return row ?? null;
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── investment-storage ─────────────────────────────────────────────────────

type AccountRow = {
  id: string;
  accountName: string;
  accountType: string;
  currency: string;
  initialInvestment: number;
  currentValue: number;
  note: string;
  color: string;
  sellCostPercent: number;
  portfolioId: string | null;
  createdAt: string;
  updatedAt: string;
};
type RecordRow = {
  accountId: string;
  date: string;
  initialInvestment: number;
  currentValue: number;
};
type HoldingRow = {
  id: string;
  accountId: string;
  market: string;
  ticker: string;
  name: string;
  currency: string;
  quantity: number;
  memo: string;
};
type CashRow = { id: string; accountId: string; label: string; amount: number };

async function readInvestments(driver: SqlDriver): Promise<string | null> {
  const [accounts, records, holdings, cashItems, order] = await Promise.all([
    driver.query<AccountRow>("SELECT * FROM investment_account"),
    driver.query<RecordRow>("SELECT * FROM investment_record"),
    driver.query<HoldingRow>("SELECT * FROM stock_holding ORDER BY rowid"),
    driver.query<CashRow>("SELECT * FROM cash_item ORDER BY rowid"),
    readListOrder(driver, INVESTMENT_LIST),
  ]);
  if (accounts.length === 0 && !order) return null;

  // 서버 행 모양(bigint · Date)으로 맞춰 서버와 같은 변환 함수를 쓴다.
  const investments = sortByOrder(accounts, order).map((a) => ({
    id: a.id,
    ...investmentRowToFields(
      {
        ...a,
        userId: "",
        initialInvestment: BigInt(a.initialInvestment),
        currentValue: BigInt(a.currentValue),
        version: 1,
        deletedAt: null,
        changeSeq: 0,
        sortKey: null,
        createdAt: new Date(a.createdAt),
        updatedAt: new Date(a.updatedAt),
      },
      records
        .filter((r) => r.accountId === a.id)
        .map((r) => ({
          accountId: r.accountId,
          date: new Date(`${r.date}T00:00:00.000Z`),
          initialInvestment: BigInt(r.initialInvestment),
          currentValue: BigInt(r.currentValue),
        })),
      holdings.filter((h) => h.accountId === a.id),
      cashItems.filter((c) => c.accountId === a.id).map((c) => ({ ...c, amount: BigInt(c.amount) }))
    ),
  }));

  // 보유 종목 정렬은 화면 설정이라 `seedbook.preferences` 가 읽는다.
  return serialize({ investments }, INVESTMENT_VERSION);
}

async function investmentStatements(driver: SqlDriver, state: State): Promise<SqlStatement[]> {
  // 목록이 없는 envelope 로 계좌를 지우지 않는다.
  if (!Array.isArray(state.investments)) return [];
  const {
    ids,
    valid: accounts,
    invalid,
  } = partitionItems(state.investments, (item) => parseInvestmentFields(item));

  // 계좌 행을 다시 써도 생성 시각과 포트폴리오 연결은 유지한다.
  const [existing, portfolios] = await Promise.all([
    driver.query<{ id: string; createdAt: string }>("SELECT id, createdAt FROM investment_account"),
    driver.query<{ id: string; accountIds: string }>("SELECT id, accountIds FROM portfolio"),
  ]);
  const createdAt = new Map(existing.map((row) => [row.id, row.createdAt]));
  const linkedPortfolio = new Map<string, string>();
  for (const p of portfolios) {
    for (const accountId of parseJsonArray(p.accountIds)) {
      if (typeof accountId === "string") linkedPortfolio.set(accountId, p.id);
    }
  }

  const now = nowIso();
  // 하위 행은 지운 계좌와 다시 쓰는 계좌의 것만 지운다 — 격리한 계좌는 마지막 저장본을 남긴다.
  const statements: SqlStatement[] = [
    deleteMissing("investment_record", ids, "accountId"),
    deleteMissing("stock_holding", ids, "accountId"),
    deleteMissing("cash_item", ids, "accountId"),
    deleteMissing("investment_account", ids),
    ...quarantineStatements(INVESTMENT_KEY, ids, invalid),
  ];
  for (const { id, fields } of accounts) {
    statements.push(
      { sql: "DELETE FROM investment_record WHERE accountId = ?", params: [id] },
      { sql: "DELETE FROM stock_holding WHERE accountId = ?", params: [id] },
      { sql: "DELETE FROM cash_item WHERE accountId = ?", params: [id] }
    );
    const columns = investmentFieldsToColumns(fields);
    statements.push({
      sql: `INSERT INTO investment_account (id, accountName, accountType, currency, initialInvestment,
              currentValue, note, color, sellCostPercent, portfolioId, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET accountName = excluded.accountName,
              accountType = excluded.accountType, currency = excluded.currency,
              initialInvestment = excluded.initialInvestment, currentValue = excluded.currentValue,
              note = excluded.note, color = excluded.color,
              sellCostPercent = excluded.sellCostPercent, portfolioId = excluded.portfolioId,
              updatedAt = excluded.updatedAt`,
      params: [
        id,
        columns.accountName,
        columns.accountType,
        columns.currency,
        Number(columns.initialInvestment),
        Number(columns.currentValue),
        columns.note,
        columns.color,
        columns.sellCostPercent,
        linkedPortfolio.get(id) ?? null,
        createdAt.get(id) ?? now,
        now,
      ],
    });
    const children = investmentChildRows(id, fields);
    for (const r of children.records) {
      statements.push({
        sql: `INSERT OR IGNORE INTO investment_record (accountId, date, initialInvestment, currentValue)
              VALUES (?, ?, ?, ?)`,
        params: [id, formatDate(r.date), Number(r.initialInvestment), Number(r.currentValue)],
      });
    }
    // 보유 주식·현금 id 는 클라이언트가 만든 UUID 라 겹칠 수 있다 — 서버처럼 건너뛴다.
    for (const h of children.holdings) {
      statements.push({
        sql: `INSERT OR IGNORE INTO stock_holding (id, accountId, market, ticker, name, currency, quantity, memo)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [h.id, id, h.market, h.ticker, h.name, h.currency, h.quantity, h.memo],
      });
    }
    for (const c of children.cashItems) {
      statements.push({
        sql: "INSERT OR IGNORE INTO cash_item (id, accountId, label, amount) VALUES (?, ?, ?, ?)",
        params: [c.id, id, c.label, Number(c.amount)],
      });
    }
  }
  statements.push(listOrderStatement(INVESTMENT_LIST, ids));
  return statements;
}

// ─── portfolio-storage ──────────────────────────────────────────────────────

type PortfolioRow = {
  id: string;
  name: string;
  description: string;
  color: string;
  note: string;
  accountIds: string;
  driftMode: "relative" | "absolute";
  driftThresholdPercent: number;
  goalAmount: number | null;
  growthStage: number;
  goalHistory: string;
  createdAt: string;
  updatedAt: string;
};
type AllocationRow = {
  id: string;
  portfolioId: string;
  market: string;
  ticker: string;
  name: string;
  currency: string;
  targetPercent: number;
};

async function readPortfolios(driver: SqlDriver): Promise<string | null> {
  const [portfolios, allocations, order] = await Promise.all([
    driver.query<PortfolioRow>("SELECT * FROM portfolio"),
    driver.query<AllocationRow>("SELECT * FROM portfolio_allocation ORDER BY rowid"),
    readListOrder(driver, PORTFOLIO_LIST),
  ]);
  if (portfolios.length === 0 && !order) return null;

  const items = sortByOrder(portfolios, order).map((p) => ({
    id: p.id,
    ...portfolioRowToData(
      {
        ...p,
        userId: "",
        accountIds: parseJsonArray(p.accountIds).filter(
          (id): id is string => typeof id === "string"
        ),
        goalHistory: readPlantProgress({
          goalHistory: parseJsonArray(p.goalHistory),
        }).goalHistory,
        version: 1,
        deletedAt: null,
        changeSeq: 0,
        sortKey: null,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      },
      allocations.filter((a) => a.portfolioId === p.id)
    ),
  }));
  return serialize({ portfolios: dedupePortfolioLinks(items) }, PORTFOLIO_VERSION);
}

type EnvelopePortfolio = State & {
  id: string;
  accountIds: string[];
  updatedAt?: string;
};

function timestampOr(value: unknown, fallback: string): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;
}

async function portfolioStatements(driver: SqlDriver, state: State): Promise<SqlStatement[]> {
  // 목록이 없는 envelope 로 포트폴리오를 지우지 않는다.
  if (!Array.isArray(state.portfolios)) return [];
  const raw = state.portfolios as Array<{ id?: unknown; accountIds?: unknown } & State>;
  const deduped = dedupePortfolioLinks(
    raw.flatMap((p): EnvelopePortfolio[] =>
      typeof p.id === "string"
        ? [
            {
              ...p,
              id: p.id,
              updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : undefined,
              accountIds: Array.isArray(p.accountIds)
                ? p.accountIds.filter((id): id is string => typeof id === "string")
                : [],
            },
          ]
        : []
    )
  );
  // 격리 원본은 정리(dedupe) 전 store 가 넘긴 그대로 남긴다.
  const original = new Map(raw.map((p) => [p.id, p]));
  const {
    ids,
    valid: portfolios,
    invalid,
  } = partitionItems(deduped, (p) => parsePortfolioFields(p));

  // 격리한 포트폴리오는 마지막 저장본의 계좌 연결을 그대로 둔다.
  const invalidIds = new Set(invalid.map((p) => p.id));
  const keptLinks = (
    await driver.query<{ id: string; accountIds: string }>("SELECT id, accountIds FROM portfolio")
  ).filter((p) => invalidIds.has(p.id));

  const now = nowIso();
  const statements: SqlStatement[] = [
    deleteMissing("portfolio_allocation", ids, "portfolioId"),
    deleteMissing("portfolio", ids),
    ...quarantineStatements(
      PORTFOLIO_KEY,
      ids,
      invalid.map(({ id }) => ({ id, item: original.get(id) }))
    ),
    // 서버의 investment_account.portfolioId 처럼 연결을 계좌 쪽에도 적어 둔다.
    { sql: "UPDATE investment_account SET portfolioId = NULL" },
  ];
  for (const p of keptLinks) {
    for (const accountId of parseJsonArray(p.accountIds)) {
      if (typeof accountId !== "string") continue;
      statements.push({
        sql: "UPDATE investment_account SET portfolioId = ? WHERE id = ?",
        params: [p.id, accountId],
      });
    }
  }
  for (const { id, fields, item } of portfolios) {
    statements.push({
      sql: "DELETE FROM portfolio_allocation WHERE portfolioId = ?",
      params: [id],
    });
    const columns = portfolioFieldsToColumns(fields);
    statements.push({
      sql: `INSERT INTO portfolio (id, name, color, note, accountIds, driftMode, driftThresholdPercent,
              goalAmount, growthStage, goalHistory, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color,
              note = excluded.note, accountIds = excluded.accountIds, driftMode = excluded.driftMode,
              driftThresholdPercent = excluded.driftThresholdPercent,
              goalAmount = excluded.goalAmount, growthStage = excluded.growthStage,
              goalHistory = excluded.goalHistory,
              createdAt = excluded.createdAt, updatedAt = excluded.updatedAt`,
      params: [
        id,
        columns.name,
        columns.color,
        columns.note,
        JSON.stringify(columns.accountIds),
        columns.driftMode,
        columns.driftThresholdPercent,
        // 기기 envelope 은 늘 지금 앱이 쓴 것이라 식물이 있다. 없으면 씨앗으로 둔다.
        fields.plant?.goalAmount ?? INITIAL_PLANT_PROGRESS.goalAmount,
        fields.plant?.growthStage ?? INITIAL_PLANT_PROGRESS.growthStage,
        JSON.stringify(fields.plant?.goalHistory ?? INITIAL_PLANT_PROGRESS.goalHistory),
        timestampOr(item.createdAt, now),
        timestampOr(item.updatedAt, now),
      ],
    });
    for (const a of portfolioAllocationRows(id, fields)) {
      statements.push({
        sql: `INSERT OR IGNORE INTO portfolio_allocation (id, portfolioId, market, ticker, name, currency, targetPercent)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [a.id, id, a.market, a.ticker, a.name, a.currency, a.targetPercent],
      });
    }
    for (const accountId of fields.accountIds) {
      statements.push({
        sql: "UPDATE investment_account SET portfolioId = ? WHERE id = ?",
        params: [id, accountId],
      });
    }
  }
  statements.push(listOrderStatement(PORTFOLIO_LIST, ids));
  return statements;
}

// ─── rebalancing-storage ────────────────────────────────────────────────────

type RebalancingRow = {
  id: string;
  accountId: string;
  accountName: string;
  portfolioId: string;
  portfolioName: string;
  cashDelta: number;
  tasks: string;
  startedAt: string;
  completedAt: string | null;
  result: string | null;
  createdAt: string;
  updatedAt: string;
};

function parseJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function readRebalancings(driver: SqlDriver): Promise<string | null> {
  const [rows, order] = await Promise.all([
    driver.query<RebalancingRow>("SELECT * FROM rebalancing"),
    readListOrder(driver, REBALANCING_LIST),
  ]);
  if (rows.length === 0 && !order) return null;

  const sessions = sortByOrder(rows, order).map((r) =>
    rebalancingRowToPayload({
      ...r,
      userId: "",
      cashDelta: BigInt(r.cashDelta),
      tasks: parseJson(r.tasks),
      result: parseJson(r.result),
      startedAt: new Date(r.startedAt),
      completedAt: r.completedAt ? new Date(r.completedAt) : null,
      version: 1,
      deletedAt: null,
      changeSeq: 0,
      sortKey: null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    })
  );
  return serialize({ sessions }, REBALANCING_VERSION);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rebalancingStatements(driver: SqlDriver, state: State): Promise<SqlStatement[]> {
  // 목록이 없는 envelope 로 기록을 지우지 않는다.
  if (!Array.isArray(state.sessions)) return [];
  const {
    ids,
    valid: sessions,
    invalid,
  } = partitionItems(state.sessions, (item, id) =>
    UUID_RE.test(id) ? parseRebalancingFields(item) : null
  );

  const existing = await driver.query<{ id: string; createdAt: string }>(
    "SELECT id, createdAt FROM rebalancing"
  );
  const createdAt = new Map(existing.map((row) => [row.id, row.createdAt]));
  const now = nowIso();
  const statements: SqlStatement[] = [
    deleteMissing("rebalancing", ids),
    ...quarantineStatements(REBALANCING_KEY, ids, invalid),
  ];
  for (const { id, fields } of sessions) {
    const columns = rebalancingPayloadToColumns(fields);
    statements.push({
      sql: `INSERT INTO rebalancing (id, accountId, accountName, portfolioId, portfolioName, cashDelta,
              tasks, startedAt, completedAt, result, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET accountId = excluded.accountId,
              accountName = excluded.accountName, portfolioId = excluded.portfolioId,
              portfolioName = excluded.portfolioName, cashDelta = excluded.cashDelta,
              tasks = excluded.tasks, startedAt = excluded.startedAt,
              completedAt = excluded.completedAt, result = excluded.result,
              updatedAt = excluded.updatedAt`,
      params: [
        id,
        columns.accountId,
        columns.accountName,
        columns.portfolioId,
        columns.portfolioName,
        Number(columns.cashDelta),
        JSON.stringify(columns.tasks),
        columns.startedAt.toISOString(),
        columns.completedAt ? columns.completedAt.toISOString() : null,
        columns.result === null ? null : JSON.stringify(columns.result),
        createdAt.get(id) ?? now,
        now,
      ],
    });
  }
  statements.push(listOrderStatement(REBALANCING_LIST, ids));
  return statements;
}

// ─── seedbook.preferences ───────────────────────────────────────────────────

async function readPreferences(driver: SqlDriver): Promise<string | null> {
  const row = await readPreference(driver);
  if (!row) return null;
  return serialize(
    {
      rebalancingTaskSort: row.rebalancingTaskSort,
      rebalancingCollapsedSections: parseJsonArray(row.rebalancingCollapsedSections),
      accountSortOption: row.accountSortOption,
      portfolioStockSortOption: row.portfolioStockSortOption,
      investmentTrendRange: row.investmentTrendRange,
      holdingsSortOption: row.holdingsSortOption,
    },
    PREFERENCES_VERSION
  );
}

/** `seedbook.preferences` 의 글자 값 항목 — 이름이 그대로 `user_preference` 컬럼이다. */
const PREFERENCE_TEXT_COLUMNS = [
  "rebalancingTaskSort",
  "accountSortOption",
  "portfolioStockSortOption",
  "investmentTrendRange",
  "holdingsSortOption",
] as const;

function preferencesStatements(state: State): SqlStatement[] {
  // 값 검증은 preferences store 의 merge 가 읽을 때 한다 (서버 /api/me/preferences 와 같은 규칙).
  const columns: Record<string, SqlValue> = {};
  for (const name of PREFERENCE_TEXT_COLUMNS) {
    const value = state[name];
    if (typeof value === "string") columns[name] = value;
  }
  if (Array.isArray(state.rebalancingCollapsedSections)) {
    columns.rebalancingCollapsedSections = JSON.stringify(state.rebalancingCollapsedSections);
  }
  return Object.keys(columns).length > 0 ? [preferenceStatement(columns)] : [];
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

// ─── device_quarantine ──────────────────────────────────────────────────────

export type QuarantinedItem = {
  storageKey: string;
  itemId: string;
  /** store 가 저장하려던 원본 그대로. */
  item: unknown;
  quarantinedAt: string;
};

/** 검증에 실패해 테이블에 쓰지 못한 항목들 (오래된 것부터). */
export async function readQuarantinedItems(driver: SqlDriver): Promise<QuarantinedItem[]> {
  const rows = await driver.query<{
    storageKey: string;
    itemId: string;
    item: string;
    quarantinedAt: string;
  }>(
    "SELECT storageKey, itemId, item, quarantinedAt FROM device_quarantine ORDER BY quarantinedAt, rowid"
  );
  return rows.map((row) => ({ ...row, item: parseJson(row.item) }));
}

// ─── public API ─────────────────────────────────────────────────────────────

/** 테이블에서 envelope 를 조립한다. 저장된 것이 없으면 null. */
export async function readTableEnvelope(driver: SqlDriver, key: string): Promise<string | null> {
  if (key === INVESTMENT_KEY) return readInvestments(driver);
  if (key === PORTFOLIO_KEY) return readPortfolios(driver);
  if (key === REBALANCING_KEY) return readRebalancings(driver);
  if (key === PREFERENCES_KEY) return readPreferences(driver);
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
  if (key === INVESTMENT_KEY) statements = await investmentStatements(driver, state);
  else if (key === PORTFOLIO_KEY) statements = await portfolioStatements(driver, state);
  else if (key === REBALANCING_KEY) statements = await rebalancingStatements(driver, state);
  else if (key === PREFERENCES_KEY) statements = preferencesStatements(state);
  else if (key === ACCOUNT_SNAPSHOT_STORAGE_KEY) {
    statements = await accountSnapshotStatements(driver, state);
  } else if (key === HOLDINGS_HISTORY_STORAGE_KEY) statements = holdingsHistoryStatements(state);
  if (statements.length > 0) await driver.batch(statements);
}

/** envelope 하나를 지운다 (persist 의 removeItem). */
export async function removeTableEnvelope(driver: SqlDriver, key: string): Promise<void> {
  if (key === INVESTMENT_KEY) {
    await driver.batch([
      { sql: "DELETE FROM investment_record" },
      { sql: "DELETE FROM stock_holding" },
      { sql: "DELETE FROM cash_item" },
      { sql: "DELETE FROM investment_account" },
      { sql: "DELETE FROM user_list_order WHERE domain = ?", params: [INVESTMENT_LIST] },
    ]);
  } else if (key === PORTFOLIO_KEY) {
    await driver.batch([
      { sql: "DELETE FROM portfolio_allocation" },
      { sql: "DELETE FROM portfolio" },
      { sql: "UPDATE investment_account SET portfolioId = NULL" },
      { sql: "DELETE FROM user_list_order WHERE domain = ?", params: [PORTFOLIO_LIST] },
    ]);
  } else if (key === REBALANCING_KEY) {
    await driver.batch([
      { sql: "DELETE FROM rebalancing" },
      { sql: "DELETE FROM user_list_order WHERE domain = ?", params: [REBALANCING_LIST] },
    ]);
  } else if (key === PREFERENCES_KEY) {
    // 저장소 모드는 같은 행의 다른 키라 남긴다.
    await driver.batch([
      {
        sql: `UPDATE user_preference SET holdingsSortOption = 'evalDesc',
              rebalancingTaskSort = 'nameDesc', rebalancingCollapsedSections = '[]',
              accountSortOption = 'evalDesc', portfolioStockSortOption = 'driftDesc',
              investmentTrendRange = '3months'`,
      },
    ]);
  } else if (key === ACCOUNT_SNAPSHOT_STORAGE_KEY) {
    await driver.batch([{ sql: "DELETE FROM investment_account_snapshot" }]);
  } else if (key === HOLDINGS_HISTORY_STORAGE_KEY) {
    await driver.batch([{ sql: "DELETE FROM investment_holding_history" }]);
  }
}

/** 자산 테이블·설정·기기 상태를 모두 비운다 (회원 탈퇴). */
export async function clearDeviceTables(driver: SqlDriver): Promise<void> {
  await driver.batch(
    [
      "investment_record",
      "stock_holding",
      "cash_item",
      "investment_account",
      "investment_account_snapshot",
      "investment_holding_history",
      "portfolio_allocation",
      "portfolio",
      "rebalancing",
      "user_preference",
      "user_list_order",
      "device_quarantine",
      "device_kv",
    ].map((table) => ({ sql: `DELETE FROM ${table}` }))
  );
}
