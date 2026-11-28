import { backfillUserSyncV2, lockChangeSeqs, type SyncV2Keys, schema } from "@seedbook/database";
import { accountRecord, deriveRecordId, rebalancingTask, sortKeysAfter } from "@seedbook/domain";
import { and, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Tx } from "./entity-repo";

/**
 * v1 쓰기 (`/api/sync/mutations`, `/api/storage/[key]`) 를 동기화 v2 가 보게 한다. 옛 JS 를 캐시한
 * 브라우저·PWA 는 v2 배포 뒤에도 한동안 v1 으로 쓴다 (v2-5 에서 v1 을 지울 때까지).
 *
 * v1 쓰기는 바꾼 행의 `changeSeq` 를 0 으로 두고, 같은 트랜잭션 끝에 `numberV1Writes` 를 부른다:
 * 사용자 카운터 행을 잠그고(v2 push 와 하나씩 커밋 → 번호 순서 = 커밋 순서) 사용자 backfill 이 0 인
 * 행에 새 번호를 매기고 v2 열(하위 userId·sortKey·금액 기록 id·`rebalancing.tasks` → `rebalancing_task`)
 * 을 채운다.
 */

export const SYNC_V2_KEYS: SyncV2Keys = {
  accountRecordId: (accountId, date) =>
    deriveRecordId(accountRecord, { parentId: accountId, fields: { date } }),
  rebalancingTaskId: (rebalancingId, allocationId) =>
    deriveRecordId(rebalancingTask, { parentId: rebalancingId, fields: { allocationId } }),
  sortKeysAfter,
};

/** v1 읽기의 하위 행 순서 (`sortKey` 바이트 순, 없으면 뒤). */
export function bySortKey(column: PgColumn) {
  return sql`${column} COLLATE "C" ASC NULLS LAST`;
}

export async function numberV1Writes(tx: Tx, userId: string): Promise<void> {
  await lockChangeSeqs(tx, userId);
  await backfillUserSyncV2(tx, userId, SYNC_V2_KEYS);
}

/**
 * v1 포트폴리오 저장의 계좌 연결. v2 에서는 `account.portfolioId` 가 원본이라, 이 포트폴리오가 담은
 * 계좌만 이 포트폴리오로 잇고 이 포트폴리오를 가리키던 나머지 계좌만 끊는다 — 다른 포트폴리오의
 * 연결(v2 기기가 바꾼 것)은 건드리지 않는다. 바뀐 계좌는 새 번호를 받는다.
 */
export async function linkPortfolioAccounts(
  tx: Tx,
  userId: string,
  portfolioId: string,
  accountIds: string[]
): Promise<void> {
  const a = schema.investmentAccount;
  const changed = { version: sql`${a.version} + 1`, changeSeq: 0 };
  if (accountIds.length > 0) {
    await tx
      .update(a)
      .set({ portfolioId, ...changed })
      .where(
        and(
          eq(a.userId, userId),
          isNull(a.deletedAt),
          inArray(a.id, accountIds),
          or(isNull(a.portfolioId), ne(a.portfolioId, portfolioId))
        )
      );
  }
  await tx
    .update(a)
    .set({ portfolioId: null, ...changed })
    .where(
      and(
        eq(a.userId, userId),
        eq(a.portfolioId, portfolioId),
        accountIds.length > 0 ? notInArray(a.id, accountIds) : undefined
      )
    );
}

/**
 * v1 계좌 저장의 연결: 연결이 없는 계좌를 그 계좌를 담은 (살아 있는) 포트폴리오로 잇는다 — v1 은 새
 * 계좌가 그 계좌를 담은 포트폴리오보다 늦게 도착할 수 있다. 이미 연결된 계좌는 그대로 둔다.
 */
export async function linkNewAccount(tx: Tx, userId: string, accountId: string): Promise<void> {
  await tx.execute(sql`
    UPDATE "seedbook"."investment_account" AS a
    SET "portfolioId" = p."id", "version" = a."version" + 1, "changeSeq" = 0
    FROM (
      SELECT "id" FROM "seedbook"."portfolio"
      WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND ${accountId}::uuid = ANY ("accountIds")
      ORDER BY "updatedAt" DESC, "id" LIMIT 1
    ) AS p
    WHERE a."id" = ${accountId}::uuid AND a."userId" = ${userId} AND a."portfolioId" IS NULL
  `);
}

type ChildTable =
  | typeof schema.stockHolding
  | typeof schema.cashItem
  | typeof schema.investmentRecord
  | typeof schema.portfolioAllocation;

/**
 * v1 의 하위 목록 통째 저장 (부모 하나의 보유 종목·현금·금액 기록·배분). 지웠다 다시 넣으면 v2 기기가
 * 지운 항목을 알 수 없으니, 목록에서 빠진 행은 톰스톤으로, 들어온 행은 upsert (톰스톤이면 되살림) 한다.
 * 바꾼 행은 모두 새 번호를 받고, 목록 순서는 `sortKey` 로 남긴다 (v1 읽기도 그 순서로 읽는다). 남의
 * 행과 키가 겹치면 건너뛴다 (부모가 다르면 갱신하지 않는다).
 *
 * `key`: 행을 가리는 열 — 보유 종목·현금·배분은 `id`, 금액 기록은 날짜 (`(accountId, date)` 가 기본 키).
 */
export async function replaceChildren(
  tx: Tx,
  table: ChildTable,
  parent: { column: "accountId" | "portfolioId"; id: string },
  key: "id" | "date",
  rows: Array<Record<string, unknown>>
): Promise<void> {
  const t = table as unknown as Record<string, PgColumn>;
  const parentCol = t[parent.column] as PgColumn;
  const keyCol = t[key] as PgColumn;
  const deletedAt = t.deletedAt as PgColumn;
  const version = t.version as PgColumn;
  const now = new Date();
  const kept = rows.map((r) => r[key] as string);
  // 목록 순서 = sortKey (금액 기록은 날짜 순이라 sortKey 가 없다). v1 은 순서를 하위 목록 순서로 보낸다.
  const sortKeys = key === "id" ? sortKeysAfter(null, rows.length) : [];
  await tx
    .update(table)
    .set({ deletedAt: now, version: sql`${version} + 1`, changeSeq: 0 } as never)
    .where(
      and(
        eq(parentCol, parent.id),
        isNull(deletedAt),
        kept.length > 0 ? notInArray(keyCol, kept) : undefined
      )
    );
  for (const [index, given] of rows.entries()) {
    const row = sortKeys.length > 0 ? { ...given, sortKey: sortKeys[index] } : given;
    const { [parent.column]: _parent, [key]: _key, ...columns } = row;
    await tx
      .insert(table)
      .values({ ...row, changeSeq: 0 } as never)
      .onConflictDoUpdate({
        target: key === "date" ? [parentCol, keyCol] : keyCol,
        where: eq(parentCol, parent.id),
        set: {
          ...columns,
          deletedAt: null,
          version: sql`${version} + 1`,
          changeSeq: 0,
        } as never,
      });
  }
}
