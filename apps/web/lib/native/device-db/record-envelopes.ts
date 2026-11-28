import {
  account,
  accountRecord,
  allocation,
  cash,
  holding,
  portfolio,
  rebalancing,
  rebalancingTask,
  settings,
  UUID_PATTERN,
  uuidv5,
} from "@seedbook/domain";
import { dedupePortfolioLinks } from "@web/features/portfolio/utils/portfolio-links";
import { type RecordWrite, readRecords, type StoredRecord, writeRecords } from "./record-store";
import type { SqlDriver } from "./sql-driver";

/**
 * Zustand persist envelope (`{ state, version }`) ↔ 기기 레코드 (`records`). 화면 store 는 아직
 * 중첩 모양(계좌 안의 보유 종목 …)이라, 저장 때 레코드로 나누고(decompose) 읽을 때 다시 묶는다
 * (compose). v2-4b 에서 정의에서 만든 decompose/compose·outbox 로 바뀐다 — 그때까지 기존 store 가
 * 그대로 동작하게 하는 어댑터다.
 *
 * - 저장은 **레코드 단위 upsert** 다. 목록에서 빠진 항목(사용자가 지움)만 톰스톤으로 지운다
 *   (설계 §5.4). 검증에 실패한 필드는 쓰지 않고 격리한다 — 기존 값이 그대로 남는다.
 * - 읽을 때 돌려주는 `version` 은 서버 envelope 번역기·옛 기기 테이블과 같아 store 의 `migrate` 가
 *   같은 경로로 정리한다.
 * - 정의에 없는 옛 store 필드는 레코드 `data` 에 함께 둔다 (`extra`): 계좌 `sellCostPercent`,
 *   포트폴리오 `accountIds`·`createdAt`·`updatedAt`. 계좌 ↔ 포트폴리오 연결은 지금 store 처럼
 *   `portfolio.accountIds` 가 원본이고, `account.portfolioId` 는 그 사본이다 (v2-4b 에서 뒤집는다).
 */

export const INVESTMENT_KEY = "investment-storage";
export const PORTFOLIO_KEY = "portfolio-storage";
export const REBALANCING_KEY = "rebalancing-storage";
export const PREFERENCES_KEY = "seedbook.preferences";

export const RECORD_ENVELOPE_KEYS = [
  INVESTMENT_KEY,
  PORTFOLIO_KEY,
  REBALANCING_KEY,
  PREFERENCES_KEY,
] as const;

export function isRecordEnvelopeKey(key: string): boolean {
  return (RECORD_ENVELOPE_KEYS as readonly string[]).includes(key);
}

/** 서버 envelope 번역기·옛 기기 테이블과 같은 version. */
const INVESTMENT_VERSION = 4;
const PORTFOLIO_VERSION = 3;
const REBALANCING_VERSION = 1;
const PREFERENCES_VERSION = 1;

/**
 * 설정 레코드의 id. 서버는 사용자 id 이지만 기기 저장소는 계정을 모른다 (계정 자리는
 * `account-storage.ts` 가 나눈다). v2-4b 가 서버와 주고받을 때 맞춘다.
 */
export const DEVICE_SETTINGS_ID = "device";

/** 레코드 타입 → 그 레코드가 속한 envelope. */
const TYPES_BY_KEY: Record<(typeof RECORD_ENVELOPE_KEYS)[number], string[]> = {
  [INVESTMENT_KEY]: [account.type, holding.type, cash.type, accountRecord.type],
  [PORTFOLIO_KEY]: [portfolio.type, allocation.type],
  [REBALANCING_KEY]: [rebalancing.type, rebalancingTask.type],
  [PREFERENCES_KEY]: [settings.type],
};

type State = Record<string, unknown>;
type Item = Record<string, unknown>;

function parseEnvelopeState(value: string): State | null {
  try {
    const parsed = JSON.parse(value) as { state?: unknown };
    return isItem(parsed?.state) ? parsed.state : null;
  } catch {
    return null;
  }
}

const serialize = (state: State, version: number) => JSON.stringify({ state, version });

function isItem(value: unknown): value is Item {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** id 가 문자열인 항목만 (store 가 만든 항목에는 늘 id 가 있다 — 없으면 짝지을 수 없다). */
function itemsWithId(value: unknown): Array<Item & { id: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Item & { id: string } => isItem(item) && typeof item.id === "string"
  );
}

/** 목록 순서 → `sortKey`. 같은 길이의 숫자 문자열이라 사전순 = 목록 순. */
export function sortKeyAt(index: number): string {
  return index.toString().padStart(8, "0");
}

/** 넘긴 이름 중 값이 있는 것만 (없는 필드는 패치에 넣지 않는다 — 원칙 2). */
function pick(item: Item, names: readonly string[]): Item {
  const out: Item = {};
  for (const name of names) if (item[name] !== undefined) out[name] = item[name];
  return out;
}

const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const textList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

interface LiveRow {
  type: string;
  id: string;
  parentId: string | null;
}

/** 지금 살아 있는 레코드 (id·부모만). 지운 항목을 계산하는 기준. */
async function liveRows(driver: SqlDriver, types: string[]): Promise<LiveRow[]> {
  return driver.query<LiveRow>(
    `SELECT type, id, parentId FROM records
      WHERE deletedAt IS NULL AND type IN (${types.map(() => "?").join(", ")})`,
    types
  );
}

/**
 * 하위 레코드 목록 쓰기. 같은 id 가 다른 부모에도 있으면(클라이언트 UUID 겹침) 처음 것만 쓴다 —
 * 옛 테이블의 `INSERT OR IGNORE` 와 같다.
 */
class ChildWriter {
  readonly writes: RecordWrite[] = [];
  private readonly claimed = new Map<string, Set<string>>();

  put(type: string, id: string, parentId: string, index: number, fields: Item) {
    const ids = this.claimed.get(type) ?? new Set<string>();
    this.claimed.set(type, ids);
    if (ids.has(id)) return;
    ids.add(id);
    this.writes.push({ op: "put", type, id, parentId, sortKey: sortKeyAt(index), fields });
  }

  has(type: string, id: string) {
    return this.claimed.get(type)?.has(id) ?? false;
  }
}

/**
 * 지운 항목: 목록에서 빠진 부모와 그 하위, 다시 쓴 부모에서 빠진 하위. 다른 부모로 옮긴 하위는
 * 새로 쓰므로 지우지 않는다.
 */
function deletions(
  live: LiveRow[],
  parentType: string,
  keptParents: Set<string>,
  children: ChildWriter
): RecordWrite[] {
  const removedParents = new Set(
    live.filter((r) => r.type === parentType && !keptParents.has(r.id)).map((r) => r.id)
  );
  const writes: RecordWrite[] = [];
  for (const row of live) {
    if (row.type === parentType) {
      if (removedParents.has(row.id)) writes.push({ op: "delete", type: row.type, id: row.id });
      continue;
    }
    const parentTouched =
      row.parentId !== null && (removedParents.has(row.parentId) || keptParents.has(row.parentId));
    if (parentTouched && !children.has(row.type, row.id)) {
      writes.push({ op: "delete", type: row.type, id: row.id });
    }
  }
  return writes;
}

/** derived 키 (uuidv5(부모, 값)). 부모 id 가 UUID 가 아닌 옛 기기 데이터면 기기 안에서만 쓰는 id. */
function derivedId(parentId: string, name: string): string {
  return UUID_PATTERN.test(parentId) ? uuidv5(parentId, name) : `${parentId}:${name}`;
}

const groupByParent = (records: StoredRecord[]) => {
  const map = new Map<string, StoredRecord[]>();
  for (const r of records) {
    if (r.parentId === null) continue;
    const list = map.get(r.parentId) ?? [];
    list.push(r);
    map.set(r.parentId, list);
  }
  return map;
};

const ofType = (records: StoredRecord[], type: string) => records.filter((r) => r.type === type);

/** 이 envelope 의 레코드가 한 번이라도 저장됐는지 (모두 지웠으면 빈 목록, 처음이면 null). */
async function everStored(driver: SqlDriver, type: string): Promise<boolean> {
  const rows = await driver.query("SELECT 1 FROM records WHERE type = ? LIMIT 1", [type]);
  return rows.length > 0;
}

// ─── investment-storage ─────────────────────────────────────────────────────

const ACCOUNT_FIELDS = [
  "accountName",
  "accountType",
  "currency",
  "initialInvestment",
  "currentValue",
  "note",
  "color",
] as const;
const HOLDING_FIELDS = ["market", "ticker", "name", "currency", "quantity", "memo"] as const;
const CASH_FIELDS = ["label", "amount"] as const;
const ACCOUNT_RECORD_FIELDS = ["date", "initialInvestment", "currentValue"] as const;

async function investmentWrites(driver: SqlDriver, state: State): Promise<RecordWrite[]> {
  // 목록이 없는 envelope 로 계좌를 지우지 않는다.
  if (!Array.isArray(state.investments)) return [];
  const accounts = itemsWithId(state.investments);
  const writes: RecordWrite[] = [];
  const children = new ChildWriter();
  // 연결은 포트폴리오의 accountIds 가 원본이다 — 포트폴리오가 먼저 저장된 계좌도 이어지게 그 값을 쓴다.
  const owner = await savedPortfolioOwners(driver);

  accounts.forEach((item, index) => {
    writes.push({
      op: "put",
      type: account.type,
      id: item.id,
      sortKey: sortKeyAt(index),
      fields: { ...pick(item, ACCOUNT_FIELDS), portfolioId: owner.get(item.id) ?? null },
      extra:
        item.sellCostPercent === undefined
          ? undefined
          : { sellCostPercent: finiteOr(item.sellCostPercent, 0) },
    });
    itemsWithId(item.holdings).forEach((h, i) => {
      children.put(holding.type, h.id, item.id, i, pick(h, HOLDING_FIELDS));
    });
    itemsWithId(item.cashItems).forEach((c, i) => {
      children.put(cash.type, c.id, item.id, i, pick(c, CASH_FIELDS));
    });
    const records = Array.isArray(item.records) ? item.records.filter(isItem) : [];
    records.forEach((r, i) => {
      // 같은 날짜가 둘이면 처음 것 (옛 테이블의 기본 키와 같다).
      const date = typeof r.date === "string" ? r.date : JSON.stringify(r.date ?? null);
      children.put(accountRecord.type, derivedId(item.id, date), item.id, i, {
        ...pick(r, ACCOUNT_RECORD_FIELDS),
      });
    });
  });

  const live = await liveRows(driver, TYPES_BY_KEY[INVESTMENT_KEY]);
  const kept = new Set(accounts.map((a) => a.id));
  return [...writes, ...children.writes, ...deletions(live, account.type, kept, children)];
}

async function readInvestments(driver: SqlDriver): Promise<string | null> {
  if (!(await everStored(driver, account.type))) return null;
  const { records } = await readRecords(driver, { types: TYPES_BY_KEY[INVESTMENT_KEY] });
  const holdings = groupByParent(ofType(records, holding.type));
  const cashItems = groupByParent(ofType(records, cash.type));
  const history = groupByParent(ofType(records, accountRecord.type));

  const investments = ofType(records, account.type).map(({ id, data }) => ({
    id,
    accountName: data.accountName,
    accountType: data.accountType,
    currency: data.currency,
    initialInvestment: data.initialInvestment,
    currentValue: data.currentValue,
    note: data.note,
    color: data.color,
    sellCostPercent: finiteOr(data.sellCostPercent, 0),
    // 최근 날짜부터 (서버 번역기와 같다).
    records: (history.get(id) ?? [])
      .map((r) => ({
        date: r.data.date as string,
        initialInvestment: r.data.initialInvestment,
        currentValue: r.data.currentValue,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    holdings: (holdings.get(id) ?? []).map((h) => ({
      id: h.id,
      market: h.data.market,
      ticker: h.data.ticker,
      name: h.data.name,
      currency: h.data.currency,
      quantity: h.data.quantity,
      memo: h.data.memo,
    })),
    cashItems: (cashItems.get(id) ?? []).map((c) => ({
      id: c.id,
      label: c.data.label,
      amount: c.data.amount,
    })),
  }));
  return serialize({ investments }, INVESTMENT_VERSION);
}

// ─── portfolio-storage ──────────────────────────────────────────────────────

const PORTFOLIO_FIELDS = [
  "name",
  "color",
  "note",
  "driftMode",
  "driftThresholdPercent",
  "goalAmount",
  "growthStage",
  "goalHistory",
] as const;
const ALLOCATION_FIELDS = ["market", "ticker", "name", "currency", "targetPercent"] as const;

async function portfolioWrites(driver: SqlDriver, state: State): Promise<RecordWrite[]> {
  // 목록이 없는 envelope 로 포트폴리오를 지우지 않는다.
  if (!Array.isArray(state.portfolios)) return [];
  const portfolios = dedupePortfolioLinks(
    itemsWithId(state.portfolios).map((p): Item & { id: string; accountIds: string[] } => ({
      ...p,
      accountIds: textList(p.accountIds),
      updatedAt: isTimestamp(p.updatedAt) ? p.updatedAt : undefined,
    }))
  );
  const writes: RecordWrite[] = [];
  const children = new ChildWriter();

  portfolios.forEach((item, index) => {
    const extra: Item = { accountIds: item.accountIds };
    // 시각이 없으면 넘기지 않는다 — 기존 값이 남고, 처음이면 행의 시각을 쓴다.
    if (isTimestamp(item.createdAt)) extra.createdAt = item.createdAt;
    if (isTimestamp(item.updatedAt)) extra.updatedAt = item.updatedAt;
    writes.push({
      op: "put",
      type: portfolio.type,
      id: item.id,
      sortKey: sortKeyAt(index),
      fields: pick(item, PORTFOLIO_FIELDS),
      extra,
    });
    itemsWithId(item.allocations).forEach((a, i) => {
      children.put(allocation.type, a.id, item.id, i, pick(a, ALLOCATION_FIELDS));
    });
  });

  const live = await liveRows(driver, TYPES_BY_KEY[PORTFOLIO_KEY]);
  const kept = new Set(portfolios.map((p) => p.id));
  return [
    ...writes,
    ...children.writes,
    ...deletions(live, portfolio.type, kept, children),
    ...(await accountLinkWrites(driver, portfolios)),
  ];
}

/** 저장된 포트폴리오 레코드의 연결: 계좌 id → 포트폴리오 id. */
async function savedPortfolioOwners(driver: SqlDriver): Promise<Map<string, string>> {
  const { records } = await readRecords(driver, { types: [portfolio.type] });
  const owner = new Map<string, string>();
  for (const p of records)
    for (const accountId of textList(p.data.accountIds)) owner.set(accountId, p.id);
  return owner;
}

/** 서버의 `investment_account.portfolioId` 처럼 연결을 계좌 레코드에도 적어 둔다. */
async function accountLinkWrites(
  driver: SqlDriver,
  portfolios: Array<{ id: string; accountIds: string[] }>
): Promise<RecordWrite[]> {
  const owner = new Map<string, string>();
  for (const p of portfolios) for (const accountId of p.accountIds) owner.set(accountId, p.id);
  const { records } = await readRecords(driver, { types: [account.type] });
  return records.flatMap((r): RecordWrite[] => {
    const portfolioId = owner.get(r.id) ?? null;
    if ((r.data.portfolioId ?? null) === portfolioId) return [];
    return [{ op: "put", type: account.type, id: r.id, fields: { portfolioId } }];
  });
}

async function readPortfolios(driver: SqlDriver): Promise<string | null> {
  if (!(await everStored(driver, portfolio.type))) return null;
  const { records } = await readRecords(driver, { types: TYPES_BY_KEY[PORTFOLIO_KEY] });
  const allocations = groupByParent(ofType(records, allocation.type));

  const portfolios = ofType(records, portfolio.type).map(({ id, data, createdAt, updatedAt }) => ({
    id,
    name: data.name,
    color: data.color,
    note: data.note,
    accountIds: textList(data.accountIds),
    driftMode: data.driftMode,
    driftThresholdPercent: data.driftThresholdPercent,
    goalAmount: data.goalAmount,
    growthStage: data.growthStage,
    goalHistory: data.goalHistory,
    allocations: (allocations.get(id) ?? []).map((a) => ({
      id: a.id,
      market: a.data.market,
      ticker: a.data.ticker,
      name: a.data.name,
      currency: a.data.currency,
      targetPercent: a.data.targetPercent,
    })),
    createdAt: isTimestamp(data.createdAt) ? data.createdAt : createdAt,
    updatedAt: isTimestamp(data.updatedAt) ? data.updatedAt : updatedAt,
  }));
  return serialize({ portfolios: dedupePortfolioLinks(portfolios) }, PORTFOLIO_VERSION);
}

// ─── rebalancing-storage ────────────────────────────────────────────────────

const REBALANCING_FIELDS = [
  "accountId",
  "accountName",
  "portfolioId",
  "portfolioName",
  "cashDelta",
  "startedAt",
  "completedAt",
  "result",
] as const;
const TASK_FIELDS = [
  "market",
  "ticker",
  "name",
  "action",
  "amount",
  "price",
  "quantity",
  "priceAsOf",
  "priceKind",
  "executedQuantity",
  "executedPrice",
  "orderedQuantity",
  "orderedPrice",
  "filledQuantity",
  "filledAmount",
  "done",
] as const;

async function rebalancingWrites(driver: SqlDriver, state: State): Promise<RecordWrite[]> {
  // 목록이 없는 envelope 로 기록을 지우지 않는다.
  if (!Array.isArray(state.sessions)) return [];
  const sessions = itemsWithId(state.sessions);
  const writes: RecordWrite[] = [];
  const children = new ChildWriter();

  sessions.forEach((item, index) => {
    // 할 일의 id 는 uuidv5(리밸런싱 id, 배분 id) 라 리밸런싱 id 가 UUID 여야 한다 (옛 테이블도 거부했다).
    if (!UUID_PATTERN.test(item.id)) {
      writes.push({
        op: "quarantine",
        type: rebalancing.type,
        id: item.id,
        code: "invalid",
        value: item,
      });
      return;
    }
    writes.push({
      op: "put",
      type: rebalancing.type,
      id: item.id,
      sortKey: sortKeyAt(index),
      fields: pick(item, REBALANCING_FIELDS),
    });
    itemsWithId(item.tasks).forEach((task, i) => {
      children.put(rebalancingTask.type, uuidv5(item.id, task.id), item.id, i, {
        allocationId: task.id,
        ...pick(task, TASK_FIELDS),
      });
    });
  });

  const live = await liveRows(driver, TYPES_BY_KEY[REBALANCING_KEY]);
  // 격리한 리밸런싱은 지운 것이 아니다.
  const kept = new Set(sessions.map((s) => s.id));
  return [...writes, ...children.writes, ...deletions(live, rebalancing.type, kept, children)];
}

async function readRebalancings(driver: SqlDriver): Promise<string | null> {
  if (!(await everStored(driver, rebalancing.type))) return null;
  const { records } = await readRecords(driver, { types: TYPES_BY_KEY[REBALANCING_KEY] });
  const tasks = groupByParent(ofType(records, rebalancingTask.type));

  const sessions = ofType(records, rebalancing.type).map(({ id, data }) => ({
    id,
    accountId: data.accountId,
    accountName: data.accountName,
    portfolioId: data.portfolioId,
    portfolioName: data.portfolioName,
    cashDelta: data.cashDelta,
    tasks: (tasks.get(id) ?? []).map((t) => ({
      id: t.data.allocationId,
      market: t.data.market,
      ticker: t.data.ticker,
      name: t.data.name,
      action: t.data.action,
      amount: t.data.amount,
      price: t.data.price,
      quantity: t.data.quantity,
      priceAsOf: t.data.priceAsOf,
      priceKind: t.data.priceKind,
      executedQuantity: t.data.executedQuantity,
      executedPrice: t.data.executedPrice,
      orderedQuantity: t.data.orderedQuantity,
      orderedPrice: t.data.orderedPrice,
      filledQuantity: t.data.filledQuantity,
      filledAmount: t.data.filledAmount,
      done: t.data.done,
    })),
    startedAt: data.startedAt,
    completedAt: data.completedAt,
    result: data.result,
  }));
  return serialize({ sessions }, REBALANCING_VERSION);
}

// ─── seedbook.preferences ───────────────────────────────────────────────────

const PREFERENCE_FIELDS = Object.keys(settings.fields);

function preferenceWrites(state: State): RecordWrite[] {
  const fields = pick(state, PREFERENCE_FIELDS);
  if (Object.keys(fields).length === 0) return [];
  return [{ op: "put", type: settings.type, id: DEVICE_SETTINGS_ID, fields }];
}

async function readPreferences(driver: SqlDriver): Promise<string | null> {
  const { records } = await readRecords(driver, { types: [settings.type] });
  const row = records.find((r) => r.id === DEVICE_SETTINGS_ID);
  return row ? serialize(pick(row.data, PREFERENCE_FIELDS), PREFERENCES_VERSION) : null;
}

// ─── public API ─────────────────────────────────────────────────────────────

/** envelope 를 레코드 쓰기로 나눈다. envelope 가 아니거나 다룰 키가 아니면 빈 목록. */
export async function recordEnvelopeWrites(
  driver: SqlDriver,
  key: string,
  value: string
): Promise<RecordWrite[]> {
  const state = parseEnvelopeState(value);
  if (!state) return [];
  if (key === INVESTMENT_KEY) return investmentWrites(driver, state);
  if (key === PORTFOLIO_KEY) return portfolioWrites(driver, state);
  if (key === REBALANCING_KEY) return rebalancingWrites(driver, state);
  if (key === PREFERENCES_KEY) return preferenceWrites(state);
  return [];
}

/** 레코드에서 envelope 를 조립한다. 저장된 것이 없으면 null. */
export async function readRecordEnvelope(driver: SqlDriver, key: string): Promise<string | null> {
  if (key === INVESTMENT_KEY) return readInvestments(driver);
  if (key === PORTFOLIO_KEY) return readPortfolios(driver);
  if (key === REBALANCING_KEY) return readRebalancings(driver);
  if (key === PREFERENCES_KEY) return readPreferences(driver);
  return null;
}

/** envelope 를 레코드로 나눠 한 트랜잭션으로 저장한다. */
export async function writeRecordEnvelope(
  driver: SqlDriver,
  key: string,
  value: string,
  writtenBy: string
): Promise<void> {
  const writes = await recordEnvelopeWrites(driver, key, value);
  if (writes.length > 0) await writeRecords(driver, writes, { writtenBy });
}

/** envelope 하나를 지운다 (persist 의 removeItem) — 그 envelope 의 레코드를 모두 톰스톤으로. */
export async function removeRecordEnvelope(
  driver: SqlDriver,
  key: string,
  writtenBy: string
): Promise<void> {
  if (!isRecordEnvelopeKey(key)) return;
  const types = TYPES_BY_KEY[key as (typeof RECORD_ENVELOPE_KEYS)[number]];
  const writes: RecordWrite[] = (await liveRows(driver, types)).map((r) => ({
    op: "delete",
    type: r.type,
    id: r.id,
  }));
  // 포트폴리오를 모두 지우면 계좌의 연결도 끊는다 (옛 테이블과 같다).
  if (key === PORTFOLIO_KEY) writes.push(...(await accountLinkWrites(driver, [])));
  if (writes.length > 0) await writeRecords(driver, writes, { writtenBy });
}
