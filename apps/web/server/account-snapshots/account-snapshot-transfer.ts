import { type Database, schema } from "@seedbook/database";
import type { AccountSnapshotPayload } from "@seedbook/domain/v1/account-snapshot-record";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

/**
 * 저장소 모드를 바꿀 때 계좌 총액 일별 기록을 기기와 서버 사이에서 옮긴다 (`/api/account-snapshots`).
 */

/** 한 요청에서 받는 기록 수 상한. 클라이언트는 이보다 작게 나눠 보낸다. */
export const MAX_SNAPSHOTS_PER_REQUEST = 1000;

const INSERT_CHUNK = 500;

/** 사용자의 기록 전부 (지운 계좌 것 포함), 날짜·계좌순. */
export async function listAccountSnapshots(
  db: Database,
  userId: string
): Promise<AccountSnapshotPayload[]> {
  const t = schema.investmentAccountSnapshot;
  const rows = await db
    .select()
    .from(t)
    .where(eq(t.userId, userId))
    .orderBy(asc(t.date), asc(t.accountId));
  return rows.map((r) => ({
    accountId: r.accountId,
    date: r.date,
    stockValue: Number(r.stockValue),
    cashValue: Number(r.cashValue),
    totalValue: Number(r.totalValue),
    holdingCount: r.holdingCount,
    missingPriceCount: r.missingPriceCount,
    oldestPriceDate: r.oldestPriceDate,
  }));
}

/**
 * 기기 기록을 서버에 넣는다. 같은 계좌·날짜는 덮어쓴다 (모드 전환은 로컬 우선). 이 사용자의 계좌
 * (지운 계좌 포함)가 아닌 기록은 건너뛴다 — 서버에 없는 계좌(기기에서 지운 계좌 등)이거나 남의
 * 계좌다. 저장한 수를 돌려준다.
 */
export async function saveAccountSnapshots(
  db: Database,
  userId: string,
  snapshots: readonly AccountSnapshotPayload[]
): Promise<number> {
  const accountIds = [...new Set(snapshots.map((s) => s.accountId))];
  if (accountIds.length === 0) return 0;
  const a = schema.investmentAccount;
  const owned = new Set(
    (
      await db
        .select({ id: a.id })
        .from(a)
        .where(and(eq(a.userId, userId), inArray(a.id, accountIds)))
    ).map((row) => row.id)
  );

  const now = new Date();
  const rows = snapshots
    .filter((s) => owned.has(s.accountId))
    .map((s) => ({
      accountId: s.accountId,
      userId,
      date: s.date,
      stockValue: BigInt(s.stockValue),
      cashValue: BigInt(s.cashValue),
      totalValue: BigInt(s.totalValue),
      holdingCount: s.holdingCount,
      missingPriceCount: s.missingPriceCount,
      oldestPriceDate: s.oldestPriceDate,
      createdAt: now,
      updatedAt: now,
    }));

  const t = schema.investmentAccountSnapshot;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db
      .insert(t)
      .values(rows.slice(i, i + INSERT_CHUNK))
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
  }
  return rows.length;
}
