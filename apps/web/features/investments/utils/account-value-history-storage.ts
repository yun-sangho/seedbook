"use client";

import { snapshotPriceKey } from "@seedbook/database/account-snapshot-values";
import { kstDateString } from "@seedbook/database/kst";
import { accountFetch, accountStorage } from "@web/lib/account-storage";
import {
  type AccountSnapshotPayload,
  parseSnapshotPayloads,
} from "@web/server/account-snapshots/account-snapshot-record";
import {
  ACCOUNT_SNAPSHOT_STORAGE_KEY,
  type AccountValueSnapshot,
  addDays,
  appendHoldingsEntry,
  computeMissingSnapshots,
  type DailyClose,
  type DateRange,
  earlierDate,
  fillRange,
  HOLDINGS_HISTORY_STORAGE_KEY,
  type HoldingsByAccount,
  type HoldingsEntry,
  mergeSnapshots,
  type StockSymbol,
  symbolsInRange,
} from "./account-value-history";

/**
 * local 모드 계좌 총액 기록의 기기 저장과 채우기 (`account-value-history.ts` 의 계산을 쓴다).
 * 계정 데이터라 `accountStorage` 를 거친다 (브라우저 localStorage, 앱은 SQLite 표). 보유 내역
 * 기록·채우기·모드 전환이 같은 envelope 를 읽고 고쳐 쓰므로 한 번에 하나씩 돈다.
 */

const ENVELOPE_VERSION = 1;

/** `/api/stocks/price-history` 한 요청의 종목 수·일수. 서버 상한(200종목·366일)보다 작게. */
const PRICE_ITEMS_PER_REQUEST = 100;
const PRICE_DAYS_PER_REQUEST = 180;
/** `/api/account-snapshots` 한 요청의 기록 수. 서버 상한(1000)보다 작게. */
const SNAPSHOTS_PER_REQUEST = 500;

let queue: Promise<unknown> = Promise.resolve();

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/** 오늘의 KST 날짜. */
export function kstToday(now: Date = new Date()): string {
  return kstDateString(now);
}

async function readEnvelopeList(key: string, field: string): Promise<unknown[]> {
  const raw = await accountStorage.readEnvelope(key);
  if (raw === null) return [];
  try {
    const list = (JSON.parse(raw) as { state?: Record<string, unknown> }).state?.[field];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeEnvelopeList(key: string, field: string, list: unknown[]): Promise<void> {
  await accountStorage.writeEnvelope(
    key,
    JSON.stringify({ state: { [field]: list }, version: ENVELOPE_VERSION })
  );
}

export async function readHoldingsHistory(): Promise<HoldingsEntry[]> {
  return (await readEnvelopeList(HOLDINGS_HISTORY_STORAGE_KEY, "entries")) as HoldingsEntry[];
}

export async function readAccountSnapshots(): Promise<AccountValueSnapshot[]> {
  return (
    parseSnapshotPayloads(await readEnvelopeList(ACCOUNT_SNAPSHOT_STORAGE_KEY, "snapshots")) ?? []
  );
}

const writeAccountSnapshots = (snapshots: AccountValueSnapshot[]) =>
  writeEnvelopeList(ACCOUNT_SNAPSHOT_STORAGE_KEY, "snapshots", snapshots);

/**
 * 지금 보유 내역을 이력에 남긴다 (`null` 이면 기록 중단). 마지막 항목과 같으면 쓰지 않는다.
 * 기록했으면 true.
 */
export function recordHoldings(
  accounts: HoldingsByAccount | null,
  today: string = kstToday()
): Promise<boolean> {
  return exclusive(async () => {
    const next = appendHoldingsEntry(await readHoldingsHistory(), accounts, today);
    if (next === null) return false;
    await writeEnvelopeList(HOLDINGS_HISTORY_STORAGE_KEY, "entries", next);
    return true;
  });
}

export type FetchDailyCloses = (
  symbols: StockSymbol[],
  range: DateRange
) => Promise<Map<string, DailyClose[]>>;

/**
 * 마지막 기록 이후 빠진 평일(어제까지)을 채운다. 이미 있는 날은 건드리지 않는다. 채운 기록 수.
 * 종가를 받지 못하면 throw — 아무것도 쓰지 않고 다음에 다시 채운다.
 */
export function fillMissingSnapshots({
  today = kstToday(),
  fetchCloses = fetchDailyCloses,
}: {
  today?: string;
  fetchCloses?: FetchDailyCloses;
} = {}): Promise<number> {
  return exclusive(async () => {
    const entries = await readHoldingsHistory();
    const existing = await readAccountSnapshots();
    const range = fillRange(entries, existing, today);
    if (!range) return 0;
    const symbols = symbolsInRange(entries, range);
    const prices = symbols.length > 0 ? await fetchCloses(symbols, range) : new Map();
    const added = computeMissingSnapshots(entries, range, prices);
    if (added.length > 0) await writeAccountSnapshots(mergeSnapshots(existing, added));
    return added.length;
  });
}

/** 종목별 종가 (범위 전 마지막 종가 포함, 날짜 오름차순). 종목·기간을 나눠 받아 합친다. */
export async function fetchDailyCloses(
  symbols: StockSymbol[],
  range: DateRange
): Promise<Map<string, DailyClose[]>> {
  const byDate = new Map<string, Map<string, number>>();
  for (let from = range.from; from <= range.to; from = addDays(from, PRICE_DAYS_PER_REQUEST)) {
    const to = earlierDate(addDays(from, PRICE_DAYS_PER_REQUEST - 1), range.to);
    for (let i = 0; i < symbols.length; i += PRICE_ITEMS_PER_REQUEST) {
      const res = await accountFetch("/api/stocks/price-history", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: symbols.slice(i, i + PRICE_ITEMS_PER_REQUEST), from, to }),
      });
      if (!res.ok) throw new Error(`종가 이력을 받지 못했어요 (${res.status})`);
      const body = (await res.json()) as {
        prices?: Array<{ market: string; ticker: string; closes: DailyClose[] }>;
      };
      for (const { market, ticker, closes } of body.prices ?? []) {
        const key = snapshotPriceKey(market, ticker);
        const series = byDate.get(key) ?? new Map<string, number>();
        for (const c of closes) series.set(c.date, c.close);
        byDate.set(key, series);
      }
    }
  }
  const result = new Map<string, DailyClose[]>();
  for (const [key, series] of byDate) {
    result.set(
      key,
      [...series]
        .map(([date, close]) => ({ date, close }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
    );
  }
  return result;
}

/** local → cloud: 기기 기록을 서버에 올린다 (같은 계좌·날짜는 기기 우선). 실패하면 throw. */
export function uploadAccountSnapshots(): Promise<void> {
  return exclusive(async () => {
    const snapshots = await readAccountSnapshots();
    for (let i = 0; i < snapshots.length; i += SNAPSHOTS_PER_REQUEST) {
      const res = await accountFetch("/api/account-snapshots", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshots: snapshots.slice(i, i + SNAPSHOTS_PER_REQUEST) }),
      });
      if (!res.ok) throw new Error(`계좌 총액 기록 업로드 실패: ${res.status}`);
    }
  });
}

/** cloud → local: 서버 기록을 기기 기록과 합친다 (같은 계좌·날짜는 기기 우선). 실패하면 throw. */
export function downloadAccountSnapshots(): Promise<void> {
  return exclusive(async () => {
    const res = await accountFetch("/api/account-snapshots", { credentials: "include" });
    if (!res.ok) throw new Error(`계좌 총액 기록 다운로드 실패: ${res.status}`);
    const body = (await res.json()) as { snapshots?: unknown };
    const incoming: AccountSnapshotPayload[] = parseSnapshotPayloads(body.snapshots) ?? [];
    if (incoming.length === 0) return;
    await writeAccountSnapshots(mergeSnapshots(await readAccountSnapshots(), incoming));
  });
}
