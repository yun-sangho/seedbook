import {
  type AccountSnapshotValues,
  computeAccountSnapshot,
  type SnapshotHolding,
  type SnapshotPrice,
  snapshotPriceKey,
} from "@seedbook/database/account-snapshot-values";
import type { InvestmentItem } from "../types/types";

/**
 * local 모드의 계좌 총액 일별 기록 (기기 저장). cloud 모드는 서버 crawler 가 같은 식으로 기록한다
 * (`packages/database/src/account-snapshots.ts`).
 *
 *   - **보유 내역 이력** (`HoldingsEntry`): 보유 종목·현금이 바뀐 날마다 그 날의 마지막 보유 내역.
 *     그 날부터 다음 항목 전날까지 적용된다. `accounts: null` 은 "기록 중단" (cloud 모드로 있던
 *     기간) — 그 기간은 기기가 채우지 않는다.
 *   - **일별 기록** (`AccountValueSnapshot`): 서버 `investment_account_snapshot` 과 같은 모양.
 *     앱을 열 때 마지막 기록 이후 빠진 평일을 그 날의 보유 내역 × 그 날 종가(없으면 직전 종가)로
 *     채운다. 오늘은 종가가 정해지지 않았으니 어제까지만. 이력이 생기기 전 과거는 채우지 않는다.
 *
 * 날짜는 모두 KST 달력일 (YYYY-MM-DD).
 */

/** 기기 저장 키 (`accountStorage` envelope, 앱은 SQLite 표). */
export const HOLDINGS_HISTORY_STORAGE_KEY = "holdings-history-storage";
export const ACCOUNT_SNAPSHOT_STORAGE_KEY = "account-snapshot-storage";

export interface HoldingsSnapshotAccount {
  holdings: SnapshotHolding[];
  cash: number[];
}

export type HoldingsByAccount = Record<string, HoldingsSnapshotAccount>;

export interface HoldingsEntry {
  date: string;
  accounts: HoldingsByAccount | null;
}

export interface AccountValueSnapshot extends AccountSnapshotValues {
  accountId: string;
  date: string;
}

/** 한 종목의 거래일 종가 (KST 날짜). */
export interface DailyClose {
  date: string;
  close: number;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface StockSymbol {
  market: string;
  ticker: string;
}

/** 지금 store 의 보유 내역. 종목코드가 없는 옛 보유 항목은 평가에 쓰지 않으니 뺀다. 순서는 고정. */
export function projectHoldings(
  investments: ReadonlyArray<Pick<InvestmentItem, "id" | "holdings" | "cashItems">>
): HoldingsByAccount {
  const result: HoldingsByAccount = {};
  for (const account of [...investments].sort((a, b) => compare(a.id, b.id))) {
    result[account.id] = {
      holdings: account.holdings
        .filter((h) => h.market && h.ticker)
        .map((h) => ({ market: h.market, ticker: h.ticker, quantity: h.quantity }))
        .sort(
          (a, b) =>
            compare(a.market, b.market) || compare(a.ticker, b.ticker) || a.quantity - b.quantity
        ),
      cash: account.cashItems.map((c) => c.amount).sort((a, b) => a - b),
    };
  }
  return result;
}

/**
 * 보유 내역 이력에 `date` 의 보유 내역을 더한 새 이력. 마지막 항목과 같으면 null (저장할 것 없음).
 * 같은 날이면 그 날 항목을 바꾼다. 이력이 없을 때의 기록 중단은 남기지 않는다.
 */
export function appendHoldingsEntry(
  entries: readonly HoldingsEntry[],
  accounts: HoldingsByAccount | null,
  date: string
): HoldingsEntry[] | null {
  const last = entries.at(-1);
  if (!last) return accounts === null ? null : [{ date, accounts }];
  if (JSON.stringify(last.accounts) === JSON.stringify(accounts)) return null;
  // 기기 시계가 뒤로 갔으면 마지막 날짜에 덮는다 — 이력은 날짜순이어야 한다.
  if (last.date >= date) return [...entries.slice(0, -1), { date: last.date, accounts }];
  return [...entries, { date, accounts }];
}

/** 채울 날짜 범위: 마지막 기록 다음 날(이력 시작 전이면 이력 시작일)부터 어제까지. 없으면 null. */
export function fillRange(
  entries: readonly HoldingsEntry[],
  snapshots: readonly Pick<AccountValueSnapshot, "date">[],
  today: string
): DateRange | null {
  const first = entries[0];
  if (!first) return null;
  let lastRecorded: string | null = null;
  for (const s of snapshots)
    if (lastRecorded === null || s.date > lastRecorded) lastRecorded = s.date;
  const afterLast = lastRecorded === null ? first.date : addDays(lastRecorded, 1);
  const from = laterDate(afterLast, first.date);
  const to = addDays(today, -1);
  return from <= to ? { from, to } : null;
}

/** 범위 안 어느 날이든 보유한 종목 (범위 시작에 적용되는 항목 포함). */
export function symbolsInRange(entries: readonly HoldingsEntry[], range: DateRange): StockSymbol[] {
  const symbols = new Map<string, StockSymbol>();
  for (const entry of entriesInEffect(entries, range)) {
    for (const account of Object.values(entry.accounts ?? {})) {
      for (const { market, ticker } of account.holdings) {
        symbols.set(snapshotPriceKey(market, ticker), { market, ticker });
      }
    }
  }
  return [...symbols.values()];
}

/**
 * 범위의 평일마다 그 날 적용되는 보유 내역으로 계좌별 평가를 만든다. `prices` 는 종목별 종가
 * (날짜 오름차순, 범위 시작 전의 마지막 종가 포함). 기록 중단 기간은 건너뛴다.
 */
export function computeMissingSnapshots(
  entries: readonly HoldingsEntry[],
  range: DateRange,
  prices: ReadonlyMap<string, readonly DailyClose[]>
): AccountValueSnapshot[] {
  const snapshots: AccountValueSnapshot[] = [];
  let index = -1;
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    while (index + 1 < entries.length && entries[index + 1]!.date <= day) index += 1;
    const accounts = index >= 0 ? entries[index]!.accounts : null;
    if (accounts === null || !isWeekday(day)) continue;

    for (const [accountId, account] of Object.entries(accounts)) {
      const dayPrices = new Map<string, SnapshotPrice>();
      for (const { market, ticker } of account.holdings) {
        const key = snapshotPriceKey(market, ticker);
        const close = closeOn(prices.get(key), day);
        if (close) dayPrices.set(key, close);
      }
      snapshots.push({
        accountId,
        date: day,
        ...computeAccountSnapshot(account.holdings, account.cash, dayPrices),
      });
    }
  }
  return snapshots.sort(bySnapshotOrder);
}

/** 두 기록의 합집합. 같은 계좌·날짜는 `preferred` 를 남긴다. 날짜·계좌순. */
export function mergeSnapshots(
  preferred: readonly AccountValueSnapshot[],
  other: readonly AccountValueSnapshot[]
): AccountValueSnapshot[] {
  const merged = new Map<string, AccountValueSnapshot>();
  for (const s of other) merged.set(`${s.accountId}|${s.date}`, s);
  for (const s of preferred) merged.set(`${s.accountId}|${s.date}`, s);
  return [...merged.values()].sort(bySnapshotOrder);
}

function bySnapshotOrder(a: AccountValueSnapshot, b: AccountValueSnapshot): number {
  return compare(a.date, b.date) || compare(a.accountId, b.accountId);
}

/** 범위 시작에 적용되는 항목과 범위 안에서 시작하는 항목. */
function entriesInEffect(entries: readonly HoldingsEntry[], range: DateRange): HoldingsEntry[] {
  let start = 0;
  for (let i = 0; i < entries.length; i += 1) if (entries[i]!.date <= range.from) start = i;
  return entries.slice(start).filter((e) => e.date <= range.to);
}

/** `day` 까지의 마지막 종가. 오름차순 배열에서 이분 탐색. */
function closeOn(series: readonly DailyClose[] | undefined, day: string): SnapshotPrice | null {
  if (!series) return null;
  let lo = 0;
  let hi = series.length - 1;
  let found: DailyClose | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.date <= day) {
      found = series[mid]!;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found ? { close: found.close, date: found.date } : null;
}

function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** YYYY-MM-DD 에 `days` 일을 더한다. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 두 YYYY-MM-DD 중 늦은 날 / 이른 날 (문자열이라 `Math.max` 를 쓸 수 없다). */
export function laterDate(a: string, b: string): string {
  if (a >= b) return a;
  return b;
}

export function earlierDate(a: string, b: string): string {
  if (a <= b) return a;
  return b;
}

function isWeekday(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}
