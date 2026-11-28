import { dedupePortfolioLinks } from "@mobile/features/portfolio/utils/portfolio-links";
import {
  account,
  accountRecord,
  allocation,
  assignListSortKeys,
  cash,
  holding,
  portfolio,
  rebalancing,
  rebalancingTask,
  UUID_PATTERN,
  uuidv5,
} from "@seedbook/domain";
import { knownFields, type LocalRecord, type RecordMap, recordKey } from "./records";

/**
 * 화면 store (중첩 모양) ↔ 레코드 (설계 §5.1 decompose/compose). 필드 이름은 레코드 정의에서 읽는다 —
 * store 와 이름이 다른 것(할 일 `id` ↔ `allocationId`)과 연결·파생 키만 여기서 다룬다.
 *
 * - 계좌 ↔ 포트폴리오 연결의 원본은 `account.portfolioId` 다. 포트폴리오 store 의 `accountIds` 는
 *   compose 때 계좌 레코드에서 만들고, 저장 때 계좌 레코드의 `portfolioId` 패치로 바꾼다.
 * - 정의에 없는 store 필드(포트폴리오 `createdAt`·`updatedAt`)는 레코드에
 *   함께 두고 동기화하지 않는다.
 * - 목록 순서는 `sortKey` (분수 인덱스). 순서가 맞는 기존 키는 그대로 둔다 (`assignListSortKeys`).
 */

export const INVESTMENT_STORE = "investment-storage";
export const PORTFOLIO_STORE = "portfolio-storage";
export const REBALANCING_STORE = "rebalancing-storage";

export const RECORD_STORE_KEYS = [INVESTMENT_STORE, PORTFOLIO_STORE, REBALANCING_STORE] as const;
export type RecordStoreKey = (typeof RECORD_STORE_KEYS)[number];

export function isRecordStoreKey(key: string): key is RecordStoreKey {
  return (RECORD_STORE_KEYS as readonly string[]).includes(key);
}

interface StoreShape {
  /** persist state 안의 목록 필드. */
  listField: string;
  /** 이 store 가 저장하는 레코드 타입 (첫 번째가 목록 항목). */
  types: string[];
}

export const STORE_SHAPES: Record<RecordStoreKey, StoreShape> = {
  [INVESTMENT_STORE]: {
    listField: "investments",
    types: [account.type, holding.type, cash.type, accountRecord.type],
  },
  [PORTFOLIO_STORE]: {
    listField: "portfolios",
    types: [portfolio.type, allocation.type],
  },
  [REBALANCING_STORE]: {
    listField: "sessions",
    types: [rebalancing.type, rebalancingTask.type],
  },
};

/** 레코드 타입 → 그 레코드를 저장하는 store. */
export function storeOfType(type: string): RecordStoreKey | null {
  for (const key of RECORD_STORE_KEYS) if (STORE_SHAPES[key].types.includes(type)) return key;
  return null;
}

type Item = Record<string, unknown>;
type State = Record<string, unknown>;

const isItem = (value: unknown): value is Item =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function itemsWithId(value: unknown): Array<Item & { id: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Item & { id: string } =>
      isItem(item) && typeof item.id === "string" && !!item.id
  );
}

const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

const textList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** 화면 store 가 레코드에서 알 수 없는 날짜 (다른 기기에서 받은 포트폴리오). 고정값이라 저장이 흔들리지 않는다. */
const UNKNOWN_TIME = "1970-01-01T00:00:00.000Z";

/** 저장할 레코드 하나 (store 가 아는 필드 + 기기 전용 필드). */
export interface DesiredRecord {
  type: string;
  id: string;
  parentId: string | null;
  sortKey: string | null;
  fields: Record<string, unknown>;
}

/** 다른 store 의 레코드에 거는 패치 (포트폴리오 → 계좌 `portfolioId`). */
export interface LinkPatch {
  type: string;
  id: string;
  fields: Record<string, unknown>;
}

export interface StorePlan {
  /** 이 store 의 타입 중 남길 레코드 전부. 빠진 것은 사용자가 지운 것이다. */
  records: DesiredRecord[];
  /** 레코드로 나눌 수 없는 항목 (격리할 원본). */
  invalid: Array<{ type: string; id: string; value: unknown }>;
  links: LinkPatch[];
}

/** derived 키 (uuidv5(부모, 값)). 부모 id 가 UUID 가 아니면 기기 안에서만 쓰는 id (동기화되지 않는다). */
function derivedId(parentId: string, name: string): string {
  return UUID_PATTERN.test(parentId) ? uuidv5(parentId, name) : `${parentId}:${name}`;
}

/** 형제 목록에 지금 키를 최대한 남기며 순서대로 키를 붙인다. */
function withSortKeys(list: DesiredRecord[], current: RecordMap): DesiredRecord[] {
  const keys = assignListSortKeys(
    list.map((r) => current.get(recordKey(r.type, r.id))?.sortKey ?? null)
  );
  return list.map((r, i) => ({ ...r, sortKey: keys[i] ?? null }));
}

/** 같은 타입에서 id 가 겹치면 처음 것만 (다른 부모 아래 같은 UUID). */
class Collector {
  readonly records: DesiredRecord[] = [];
  private readonly seen = new Set<string>();

  add(list: DesiredRecord[]) {
    for (const r of list) {
      const k = recordKey(r.type, r.id);
      if (this.seen.has(k)) continue;
      this.seen.add(k);
      this.records.push(r);
    }
  }
}

function childList(
  type: string,
  parentId: string,
  items: Array<Item & { id: string }>,
  current: RecordMap,
  map: (item: Item) => Item = (item) => item
): DesiredRecord[] {
  return withSortKeys(
    items.map((item) => ({
      type,
      id: item.id,
      parentId,
      sortKey: null,
      fields: knownFields(type, map(item)),
    })),
    current
  );
}

// ─── decompose ──────────────────────────────────────────────────────────────

function decomposeInvestments(state: State, current: RecordMap): StorePlan | null {
  if (!Array.isArray(state.investments)) return null;
  const accounts = itemsWithId(state.investments);
  const out = new Collector();

  const roots = withSortKeys(
    accounts.map((item) => {
      const { portfolioId: _link, ...fields } = knownFields(account.type, item);
      return { type: account.type, id: item.id, parentId: null, sortKey: null, fields };
    }),
    current
  );
  out.add(roots);

  for (const item of accounts) {
    out.add(childList(holding.type, item.id, itemsWithId(item.holdings), current));
    out.add(childList(cash.type, item.id, itemsWithId(item.cashItems), current));
    const history = Array.isArray(item.records) ? item.records.filter(isItem) : [];
    // 같은 날짜가 둘이면 처음 것 (레코드 키가 날짜에서 나온다).
    out.add(
      history.map((r) => {
        const date = typeof r.date === "string" ? r.date : JSON.stringify(r.date ?? null);
        return {
          type: accountRecord.type,
          id: derivedId(item.id, date),
          parentId: item.id,
          sortKey: null,
          fields: knownFields(accountRecord.type, r),
        };
      })
    );
  }
  return { records: out.records, invalid: [], links: [] };
}

function decomposePortfolios(state: State, current: RecordMap): StorePlan | null {
  if (!Array.isArray(state.portfolios)) return null;
  const portfolios = dedupePortfolioLinks(
    itemsWithId(state.portfolios).map((p): Item & { id: string; accountIds: string[] } => ({
      ...p,
      accountIds: textList(p.accountIds),
      updatedAt: isTimestamp(p.updatedAt) ? p.updatedAt : undefined,
    }))
  );
  const out = new Collector();
  out.add(
    withSortKeys(
      portfolios.map((item) => {
        const fields = knownFields(portfolio.type, item);
        if (isTimestamp(item.createdAt)) fields.createdAt = item.createdAt;
        if (isTimestamp(item.updatedAt)) fields.updatedAt = item.updatedAt;
        return { type: portfolio.type, id: item.id, parentId: null, sortKey: null, fields };
      }),
      current
    )
  );
  for (const item of portfolios) {
    out.add(childList(allocation.type, item.id, itemsWithId(item.allocations), current));
  }

  // 연결: 계좌 레코드의 portfolioId 를 포트폴리오 store 의 accountIds 에 맞춘다.
  const owner = new Map<string, string>();
  for (const p of portfolios) for (const accountId of p.accountIds) owner.set(accountId, p.id);
  const links: LinkPatch[] = [];
  for (const record of current.values()) {
    if (record.type !== account.type) continue;
    const portfolioId = owner.get(record.id) ?? null;
    if ((record.fields.portfolioId ?? null) !== portfolioId) {
      links.push({ type: account.type, id: record.id, fields: { portfolioId } });
    }
  }
  // 아직 레코드가 없는 계좌의 연결 (그 계좌가 저장될 때 건다).
  for (const [accountId, portfolioId] of owner) {
    if (!current.has(recordKey(account.type, accountId))) {
      links.push({ type: account.type, id: accountId, fields: { portfolioId } });
    }
  }
  return { records: out.records, invalid: [], links };
}

function decomposeRebalancings(state: State, current: RecordMap): StorePlan | null {
  if (!Array.isArray(state.sessions)) return null;
  const sessions = itemsWithId(state.sessions);
  const out = new Collector();
  const invalid: StorePlan["invalid"] = [];
  // 할 일의 id 는 uuidv5(리밸런싱 id, 배분 id) 라 리밸런싱 id 가 UUID 여야 한다.
  const valid = sessions.filter((item) => {
    if (UUID_PATTERN.test(item.id)) return true;
    invalid.push({ type: rebalancing.type, id: item.id, value: item });
    return false;
  });
  out.add(
    withSortKeys(
      valid.map((item) => ({
        type: rebalancing.type,
        id: item.id,
        parentId: null,
        sortKey: null,
        fields: knownFields(rebalancing.type, item),
      })),
      current
    )
  );
  for (const item of valid) {
    const tasks = itemsWithId(item.tasks).map((task) => ({
      ...task,
      allocationId: task.id,
      id: uuidv5(item.id, task.id),
    }));
    out.add(childList(rebalancingTask.type, item.id, tasks, current));
  }
  return { records: out.records, invalid, links: [] };
}

/**
 * store 상태 → 이 store 가 저장할 레코드. 목록 필드가 없으면 null (그 상태로는 아무것도 지우지 않는다).
 * `current` 는 지금 기기 레코드 (sortKey 를 남기고, 연결을 비교하는 데 쓴다).
 */
export function decomposeStore(
  key: RecordStoreKey,
  state: State,
  current: RecordMap
): StorePlan | null {
  if (key === INVESTMENT_STORE) return decomposeInvestments(state, current);
  if (key === PORTFOLIO_STORE) return decomposePortfolios(state, current);
  return decomposeRebalancings(state, current);
}

// ─── compose ────────────────────────────────────────────────────────────────

function byType(records: RecordMap, type: string): LocalRecord[] {
  const list = [...records.values()].filter((r) => r.type === type);
  // sortKey 바이트 순, 키가 없으면 뒤에 (들어온 순서 유지).
  return list
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ka = a.r.sortKey;
      const kb = b.r.sortKey;
      if (ka !== kb) {
        if (ka === null) return 1;
        if (kb === null) return -1;
        return ka < kb ? -1 : 1;
      }
      return a.i - b.i;
    })
    .map(({ r }) => r);
}

function childrenOf(records: RecordMap, type: string): Map<string, LocalRecord[]> {
  const map = new Map<string, LocalRecord[]>();
  for (const r of byType(records, type)) {
    if (r.parentId === null) continue;
    const list = map.get(r.parentId) ?? [];
    list.push(r);
    map.set(r.parentId, list);
  }
  return map;
}

/** 정의의 필드 이름 순서로 꺼낸다 (화면 store 는 아는 필드만 쓴다). */
function pickKnown(type: string, record: LocalRecord, omit: string[] = []): Item {
  const known = knownFields(type, record.fields);
  for (const name of omit) delete known[name];
  return known;
}

function composeInvestments(records: RecordMap): State {
  const holdings = childrenOf(records, holding.type);
  const cashItems = childrenOf(records, cash.type);
  const history = childrenOf(records, accountRecord.type);
  const investments = byType(records, account.type).map((r) => {
    const item: Item = { id: r.id, ...pickKnown(account.type, r, ["portfolioId"]) };
    // 최근 날짜부터.
    item.records = (history.get(r.id) ?? [])
      .map((h) => pickKnown(accountRecord.type, h))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    item.holdings = (holdings.get(r.id) ?? []).map((h) => ({
      id: h.id,
      ...pickKnown(holding.type, h),
    }));
    item.cashItems = (cashItems.get(r.id) ?? []).map((c) => ({
      id: c.id,
      ...pickKnown(cash.type, c),
    }));
    return item;
  });
  return { investments };
}

function composePortfolios(records: RecordMap): State {
  const allocations = childrenOf(records, allocation.type);
  const linked = new Map<string, string[]>();
  for (const a of byType(records, account.type)) {
    const portfolioId = a.fields.portfolioId;
    if (typeof portfolioId !== "string") continue;
    linked.set(portfolioId, [...(linked.get(portfolioId) ?? []), a.id]);
  }
  const portfolios = byType(records, portfolio.type).map((r) => ({
    id: r.id,
    ...pickKnown(portfolio.type, r),
    accountIds: linked.get(r.id) ?? [],
    allocations: (allocations.get(r.id) ?? []).map((a) => ({
      id: a.id,
      ...pickKnown(allocation.type, a),
    })),
    createdAt: isTimestamp(r.fields.createdAt) ? r.fields.createdAt : UNKNOWN_TIME,
    updatedAt: isTimestamp(r.fields.updatedAt) ? r.fields.updatedAt : UNKNOWN_TIME,
  }));
  return { portfolios };
}

function composeRebalancings(records: RecordMap): State {
  const tasks = childrenOf(records, rebalancingTask.type);
  const sessions = byType(records, rebalancing.type).map((r) => ({
    id: r.id,
    ...pickKnown(rebalancing.type, r),
    tasks: (tasks.get(r.id) ?? []).map((t) => {
      const { allocationId, ...rest } = pickKnown(rebalancingTask.type, t);
      return { id: allocationId, ...rest };
    }),
  }));
  return { sessions };
}

/** 레코드 → store 상태 (persist `state`). */
export function composeStore(key: RecordStoreKey, records: RecordMap): State {
  if (key === INVESTMENT_STORE) return composeInvestments(records);
  if (key === PORTFOLIO_STORE) return composePortfolios(records);
  return composeRebalancings(records);
}

/** compose 한 상태를 persist envelope 문자열로. */
export function composeEnvelope(key: RecordStoreKey, records: RecordMap): string {
  return JSON.stringify({ state: composeStore(key, records), version: 0 });
}

/** persist envelope 문자열의 `state`. 읽을 수 없으면 null. */
export function envelopeState(value: string): State | null {
  try {
    const parsed = JSON.parse(value) as { state?: unknown };
    return isItem(parsed?.state) ? parsed.state : null;
  } catch {
    return null;
  }
}
