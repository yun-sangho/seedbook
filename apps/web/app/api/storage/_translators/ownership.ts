import type { schema } from "@seedbook/database";
import { and, getTableName, inArray, ne } from "drizzle-orm";
import type { Db } from "./types";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * envelope 에 다른 사용자 소유의 행 id 가 들어 있을 때 던진다. API 라우트가 403 으로 바꾼다.
 */
export class ForeignRowError extends Error {
  constructor(readonly table: string) {
    super(`row in ${table} belongs to another user`);
    this.name = "ForeignRowError";
  }
}

/** `id` (uuid PK) 와 `userId` 를 가진, 사용자가 직접 소유하는 최상위 도메인 테이블. */
type UserOwnedTable =
  | typeof schema.investmentAccount
  | typeof schema.savingsAccount
  | typeof schema.debt
  | typeof schema.realAsset
  | typeof schema.assetPlan
  | typeof schema.portfolio
  | typeof schema.rebalancing;

/**
 * 클라이언트가 보낸 id 중 이미 **다른 사용자** 소유인 행이 있으면 `ForeignRowError`.
 *
 * id 는 클라이언트가 만든 UUID 라 upsert 의 `ON CONFLICT (id)` 가 남의 행에 걸릴 수 있다.
 * 그러면 행 자체뿐 아니라 그 id 로 지우고 다시 넣는 하위 데이터(기록·보유종목 등)까지
 * 건드리게 되므로, 쓰기를 시작하기 전에 트랜잭션 안에서 막는다.
 */
export async function assertNoForeignRows(
  tx: Tx,
  table: UserOwnedTable,
  ids: string[],
  userId: string
): Promise<void> {
  if (ids.length === 0) return;
  // 테이블 유니온 위에서 select 하면 타입 추론이 무너져, 공통 컬럼만 쓰도록 좁혀 둔다.
  const t = table as typeof schema.debt;
  const foreign = await tx
    .select({ id: t.id })
    .from(t)
    .where(and(inArray(t.id, ids), ne(t.userId, userId)))
    .limit(1);
  if (foreign.length > 0) {
    throw new ForeignRowError(getTableName(table));
  }
}
