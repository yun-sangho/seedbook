import { formatDate } from "@web/app/api/storage/_translators/types";
import { normalizeHoldingsSortOption } from "@web/features/investments/types/holdings-sort";
import { dedupePortfolioLinks } from "@web/features/portfolio/utils/portfolio-links";
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
 * 정리한다. 서버가 거부할 항목(모양이 틀린 계좌 등)은 서버처럼 저장하지 않는다.
 */

const INVESTMENT_KEY = "investment-storage";
const PORTFOLIO_KEY = "portfolio-storage";
const REBALANCING_KEY = "rebalancing-storage";
const PREFERENCES_KEY = "seedbook.preferences";

const TABLE_ENVELOPE_KEYS = [INVESTMENT_KEY, PORTFOLIO_KEY, REBALANCING_KEY, PREFERENCES_KEY];

/** 서버 번역기의 envelope version 과 같다. */
const INVESTMENT_VERSION = 4;
const PORTFOLIO_VERSION = 3;
const REBALANCING_VERSION = 1;
const PREFERENCES_VERSION = 1;

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

/** `id NOT IN (...)` — 목록이 비면 전부. */
function deleteMissing(table: string, ids: string[]): SqlStatement {
  if (ids.length === 0) return { sql: `DELETE FROM ${table}` };
  return {
    sql: `DELETE FROM ${table} WHERE id NOT IN (${ids.map(() => "?").join(", ")})`,
    params: ids,
  };
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
  }>(
    "SELECT holdingsSortOption, rebalancingTaskSort, rebalancingCollapsedSections FROM user_preference WHERE id = 1"
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
  commissionPercent: number | null;
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
  const [accounts, records, holdings, cashItems, preference, order] = await Promise.all([
    driver.query<AccountRow>("SELECT * FROM investment_account"),
    driver.query<RecordRow>("SELECT * FROM investment_record"),
    driver.query<HoldingRow>("SELECT * FROM stock_holding ORDER BY rowid"),
    driver.query<CashRow>("SELECT * FROM cash_item ORDER BY rowid"),
    readPreference(driver),
    readListOrder(driver, INVESTMENT_LIST),
  ]);
  if (accounts.length === 0 && !preference && !order) return null;

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

  return serialize(
    {
      investments,
      holdingsSortOption: normalizeHoldingsSortOption(preference?.holdingsSortOption),
    },
    INVESTMENT_VERSION
  );
}

async function investmentStatements(driver: SqlDriver, state: State): Promise<SqlStatement[]> {
  const raw = Array.isArray(state.investments)
    ? (state.investments as Array<{ id?: unknown } & State>)
    : [];
  const accounts = raw.flatMap((item) => {
    const fields = parseInvestmentFields(item);
    return typeof item.id === "string" && fields ? [{ id: item.id, fields }] : [];
  });

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
  const ids = accounts.map((a) => a.id);
  const statements: SqlStatement[] = [
    { sql: "DELETE FROM investment_record" },
    { sql: "DELETE FROM stock_holding" },
    { sql: "DELETE FROM cash_item" },
    deleteMissing("investment_account", ids),
  ];
  for (const { id, fields } of accounts) {
    const columns = investmentFieldsToColumns(fields);
    statements.push({
      sql: `INSERT INTO investment_account (id, accountName, accountType, currency, initialInvestment,
              currentValue, note, color, commissionPercent, portfolioId, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET accountName = excluded.accountName,
              accountType = excluded.accountType, currency = excluded.currency,
              initialInvestment = excluded.initialInvestment, currentValue = excluded.currentValue,
              note = excluded.note, color = excluded.color,
              commissionPercent = excluded.commissionPercent, portfolioId = excluded.portfolioId,
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
        columns.commissionPercent,
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
  statements.push(
    preferenceStatement({
      holdingsSortOption: normalizeHoldingsSortOption(state.holdingsSortOption),
    })
  );
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
        version: 1,
        deletedAt: null,
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

function portfolioStatements(state: State): SqlStatement[] {
  const raw = Array.isArray(state.portfolios)
    ? (state.portfolios as Array<{ id?: unknown; accountIds?: unknown } & State>)
    : [];
  const portfolios = dedupePortfolioLinks(
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
  ).flatMap((p) => {
    const fields = parsePortfolioFields(p);
    return fields ? [{ id: p.id, fields, createdAt: p.createdAt, updatedAt: p.updatedAt }] : [];
  });

  const now = nowIso();
  const ids = portfolios.map((p) => p.id);
  const statements: SqlStatement[] = [
    { sql: "DELETE FROM portfolio_allocation" },
    deleteMissing("portfolio", ids),
    // 서버의 investment_account.portfolioId 처럼 연결을 계좌 쪽에도 적어 둔다.
    { sql: "UPDATE investment_account SET portfolioId = NULL" },
  ];
  for (const { id, fields, createdAt, updatedAt } of portfolios) {
    const columns = portfolioFieldsToColumns(fields);
    statements.push({
      sql: `INSERT INTO portfolio (id, name, color, note, accountIds, driftMode, driftThresholdPercent,
              createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color,
              note = excluded.note, accountIds = excluded.accountIds, driftMode = excluded.driftMode,
              driftThresholdPercent = excluded.driftThresholdPercent,
              createdAt = excluded.createdAt, updatedAt = excluded.updatedAt`,
      params: [
        id,
        columns.name,
        columns.color,
        columns.note,
        JSON.stringify(columns.accountIds),
        columns.driftMode,
        columns.driftThresholdPercent,
        timestampOr(createdAt, now),
        timestampOr(updatedAt, now),
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
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    })
  );
  return serialize({ sessions }, REBALANCING_VERSION);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rebalancingStatements(driver: SqlDriver, state: State): Promise<SqlStatement[]> {
  const raw = Array.isArray(state.sessions) ? (state.sessions as unknown[]) : [];
  const sessions = raw.flatMap((item) => {
    const id = (item as { id?: unknown } | null)?.id;
    const fields = parseRebalancingFields(item);
    return typeof id === "string" && UUID_RE.test(id) && fields ? [{ id, fields }] : [];
  });

  const existing = await driver.query<{ id: string; createdAt: string }>(
    "SELECT id, createdAt FROM rebalancing"
  );
  const createdAt = new Map(existing.map((row) => [row.id, row.createdAt]));
  const now = nowIso();
  const ids = sessions.map((s) => s.id);
  const statements: SqlStatement[] = [deleteMissing("rebalancing", ids)];
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
    },
    PREFERENCES_VERSION
  );
}

function preferencesStatements(state: State): SqlStatement[] {
  // 값 검증은 preferences store 의 merge 가 읽을 때 한다 (서버 /api/me/preferences 와 같은 규칙).
  const columns: Record<string, SqlValue> = {};
  if (typeof state.rebalancingTaskSort === "string") {
    columns.rebalancingTaskSort = state.rebalancingTaskSort;
  }
  if (Array.isArray(state.rebalancingCollapsedSections)) {
    columns.rebalancingCollapsedSections = JSON.stringify(state.rebalancingCollapsedSections);
  }
  return Object.keys(columns).length > 0 ? [preferenceStatement(columns)] : [];
}

// ─── public API ─────────────────────────────────────────────────────────────

/** 테이블에서 envelope 를 조립한다. 저장된 것이 없으면 null. */
export async function readTableEnvelope(driver: SqlDriver, key: string): Promise<string | null> {
  if (key === INVESTMENT_KEY) return readInvestments(driver);
  if (key === PORTFOLIO_KEY) return readPortfolios(driver);
  if (key === REBALANCING_KEY) return readRebalancings(driver);
  if (key === PREFERENCES_KEY) return readPreferences(driver);
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
  else if (key === PORTFOLIO_KEY) statements = portfolioStatements(state);
  else if (key === REBALANCING_KEY) statements = await rebalancingStatements(driver, state);
  else if (key === PREFERENCES_KEY) statements = preferencesStatements(state);
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
      "portfolio_allocation",
      "portfolio",
      "rebalancing",
      "user_preference",
      "user_list_order",
      "device_kv",
    ].map((table) => ({ sql: `DELETE FROM ${table}` }))
  );
}
