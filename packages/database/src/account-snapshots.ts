import { and, asc, desc, eq, gt, inArray, isNull, lte, type SQL, sql } from "drizzle-orm";
import type { Database } from "./client";
import { kstDateString } from "./kst";
import * as schema from "./schema";

/**
 * 계좌별 하루 평가 기록 (`investment_account_snapshot`).
 *
 * stock-crawler 가 평일 오후 시세 수집 뒤 부른다. 대상은 cloud 모드 사용자의 삭제되지 않은 계좌다 —
 * local 모드 사용자의 서버 행은 예전에 동기화하고 남은 것일 수 있어 기록하지 않는다. 같은 날 다시
 * 돌면 그 날 행을 덮어쓴다 (멱등).
 *
 * 운영 crawler 는 연결 하나에 쿼리 제한 시간이 짧다 (`client.ts`). 계좌를 `batchSize` 개씩 끊어
 * 쿼리 하나가 사용자 수에 따라 길어지지 않게 한다.
 */

export interface SnapshotHolding {
  market: string;
  ticker: string;
  quantity: number;
}

/** 종목의 종가와 그 거래일 (KST, YYYY-MM-DD). */
export interface SnapshotPrice {
  close: number;
  date: string;
}

export interface AccountSnapshotValues {
  stockValue: number;
  cashValue: number;
  totalValue: number;
  holdingCount: number;
  missingPriceCount: number;
  oldestPriceDate: string | null;
}

export function snapshotPriceKey(market: string, ticker: string): string {
  return `${market}:${ticker}`;
}

/**
 * 계좌 하나의 평가: 종목코드가 있는 보유 종목 × 종가 + 현금 합. 종목코드가 비어 있는 옛 보유 항목은
 * 화면(`computeAccountValuation`)처럼 세지 않는다. 가격을 못 찾은 종목은 평가에서 빠지고
 * `missingPriceCount` 로 남는다. 종목마다 원 단위로 반올림한다.
 */
export function computeAccountSnapshot(
  holdings: SnapshotHolding[],
  cashAmounts: number[],
  prices: ReadonlyMap<string, SnapshotPrice>
): AccountSnapshotValues {
  let stockValue = 0;
  let holdingCount = 0;
  let missingPriceCount = 0;
  let oldestPriceDate: string | null = null;

  for (const h of holdings) {
    if (!h.market || !h.ticker) continue;
    holdingCount += 1;
    const price = prices.get(snapshotPriceKey(h.market, h.ticker));
    if (!price) {
      missingPriceCount += 1;
      continue;
    }
    stockValue += Math.round(price.close * h.quantity);
    if (oldestPriceDate === null || price.date < oldestPriceDate) oldestPriceDate = price.date;
  }

  const cashValue = cashAmounts.reduce((sum, amount) => sum + amount, 0);

  return {
    stockValue,
    cashValue,
    totalValue: stockValue + cashValue,
    holdingCount,
    missingPriceCount,
    oldestPriceDate,
  };
}

export interface RecordAccountSnapshotsResult {
  /** 기록한 계좌 수. */
  accounts: number;
  /** 가격을 못 찾은 종목이 하나라도 있는 계좌 수. */
  accountsWithMissingPrices: number;
}

const DEFAULT_BATCH_SIZE = 200;

/**
 * `date` (KST, YYYY-MM-DD) 의 계좌별 평가를 기록한다. 가격은 그 날까지의 가장 최근 종가.
 */
export async function recordAccountSnapshots(
  db: Database,
  date: string,
  { batchSize = DEFAULT_BATCH_SIZE }: { batchSize?: number } = {}
): Promise<RecordAccountSnapshotsResult> {
  const priceCache = new Map<string, SnapshotPrice | null>();
  const result: RecordAccountSnapshotsResult = { accounts: 0, accountsWithMissingPrices: 0 };
  let cursor: string | null = null;

  for (;;) {
    const accounts = await selectCloudAccounts(db, cursor, batchSize);
    if (accounts.length === 0) break;
    cursor = accounts[accounts.length - 1]!.id;

    const ids = accounts.map((a) => a.id);
    const holdings = await db
      .select({
        accountId: schema.stockHolding.accountId,
        market: schema.stockHolding.market,
        ticker: schema.stockHolding.ticker,
        quantity: schema.stockHolding.quantity,
      })
      .from(schema.stockHolding)
      .where(inArray(schema.stockHolding.accountId, ids));
    const cashItems = await db
      .select({ accountId: schema.cashItem.accountId, amount: schema.cashItem.amount })
      .from(schema.cashItem)
      .where(inArray(schema.cashItem.accountId, ids));

    await loadPrices(db, date, holdings, priceCache);
    const prices = new Map<string, SnapshotPrice>();
    for (const [key, price] of priceCache) if (price) prices.set(key, price);

    const now = new Date();
    const rows = accounts.map((account) => {
      const values = computeAccountSnapshot(
        holdings.filter((h) => h.accountId === account.id),
        cashItems.filter((c) => c.accountId === account.id).map((c) => Number(c.amount)),
        prices
      );
      if (values.missingPriceCount > 0) result.accountsWithMissingPrices += 1;
      return {
        accountId: account.id,
        userId: account.userId,
        date,
        stockValue: BigInt(values.stockValue),
        cashValue: BigInt(values.cashValue),
        totalValue: BigInt(values.totalValue),
        holdingCount: values.holdingCount,
        missingPriceCount: values.missingPriceCount,
        oldestPriceDate: values.oldestPriceDate,
        createdAt: now,
        updatedAt: now,
      };
    });

    const t = schema.investmentAccountSnapshot;
    await db
      .insert(t)
      .values(rows)
      .onConflictDoUpdate({
        target: [t.accountId, t.date],
        set: {
          stockValue: sql`excluded."stockValue"`,
          cashValue: sql`excluded."cashValue"`,
          totalValue: sql`excluded."totalValue"`,
          holdingCount: sql`excluded."holdingCount"`,
          missingPriceCount: sql`excluded."missingPriceCount"`,
          oldestPriceDate: sql`excluded."oldestPriceDate"`,
          updatedAt: now,
        },
      });

    result.accounts += rows.length;
    if (accounts.length < batchSize) break;
  }

  return result;
}

/** cloud 모드 사용자의 삭제되지 않은 계좌를 id 순으로 `cursor` 다음부터 `limit` 개. */
function selectCloudAccounts(db: Database, cursor: string | null, limit: number) {
  const a = schema.investmentAccount;
  const p = schema.userPreference;
  const conditions: SQL[] = [eq(p.storageMode, "cloud"), isNull(a.deletedAt)];
  if (cursor !== null) conditions.push(gt(a.id, cursor));
  return db
    .select({ id: a.id, userId: a.userId })
    .from(a)
    .innerJoin(p, eq(p.userId, a.userId))
    .where(and(...conditions))
    .orderBy(asc(a.id))
    .limit(limit);
}

/** 아직 캐시에 없는 종목의 `date` 까지 가장 최근 종가를 읽어 캐시에 넣는다 (없으면 null). */
async function loadPrices(
  db: Database,
  date: string,
  holdings: SnapshotHolding[],
  cache: Map<string, SnapshotPrice | null>
): Promise<void> {
  const wanted = new Map<string, { market: string; ticker: string }>();
  for (const h of holdings) {
    if (!h.market || !h.ticker) continue;
    const key = snapshotPriceKey(h.market, h.ticker);
    if (!cache.has(key)) wanted.set(key, { market: h.market, ticker: h.ticker });
  }
  if (wanted.size === 0) return;

  const sp = schema.stockPrice;
  const pairs = sql.join(
    [...wanted.values()].map((s) => sql`(${s.market}, ${s.ticker})`),
    sql`, `
  );
  // StockPrice.date 는 그 거래일의 KST 자정이다.
  const until = new Date(`${date}T00:00:00+09:00`);
  const rows = await db
    .selectDistinctOn([sp.stockMarket, sp.stockTicker], {
      market: sp.stockMarket,
      ticker: sp.stockTicker,
      close: sp.close,
      date: sp.date,
    })
    .from(sp)
    .where(and(sql`(${sp.stockMarket}, ${sp.stockTicker}) IN (${pairs})`, lte(sp.date, until)))
    .orderBy(sp.stockMarket, sp.stockTicker, desc(sp.date));

  for (const key of wanted.keys()) cache.set(key, null);
  for (const row of rows) {
    cache.set(snapshotPriceKey(row.market, row.ticker), {
      close: Number(row.close),
      date: kstDateString(row.date),
    });
  }
}
