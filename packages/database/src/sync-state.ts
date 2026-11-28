import { type SQL, sql } from "drizzle-orm";

/** 트랜잭션 `tx` (또는 `db`) 에서 쓰는 최소 실행기. */
export type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

/**
 * 사용자의 동기화 변경 번호 `count` 개를 받는다 (설계 §4.4). 받은 번호는 `first … first+count-1`
 * 이고, 바꾼 레코드의 `changeSeq` 에 순서대로 넣는다.
 *
 * `user_sync_state` 행을 올리는 UPDATE 의 행 잠금이 트랜잭션 끝까지 남아 같은 사용자의 쓰기를
 * 직렬화한다 — 반드시 레코드를 쓰는 트랜잭션 안에서 부른다. 서버가 직접 쓰는 경로(backfill·시드
 * 리셋)도 이 함수로 번호를 받는다. 받은 번호를 쓰지 않으면 pull 이 변경을 놓친다.
 */
export async function reserveChangeSeqs(
  tx: SqlExecutor,
  userId: string,
  count: number
): Promise<{ first: number; last: number }> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`reserveChangeSeqs: count must be a positive integer, got ${count}`);
  }
  const rows = (await tx.execute(sql`
    INSERT INTO "seedbook"."user_sync_state" ("userId", "seq")
    VALUES (${userId}, ${count})
    ON CONFLICT ("userId") DO UPDATE SET "seq" = "user_sync_state"."seq" + ${count}
    RETURNING "seq"
  `)) as Array<{ seq: string | number }>;
  const row = rows[0];
  if (!row) throw new Error(`reserveChangeSeqs: no user_sync_state row for ${userId}`);
  const last = Number(row.seq);
  return { first: last - count + 1, last };
}

/**
 * 사용자의 `user_sync_state` 행을 잠그고 지금 번호를 돌려준다 (번호는 올리지 않는다). push 처럼
 * 읽고 판단한 뒤 쓰는 트랜잭션이 맨 앞에서 불러, 판단에 쓴 읽기까지 같은 사용자의 다른 쓰기와
 * 직렬화한다. 실제로 쓰는 레코드의 번호는 그 뒤 `reserveChangeSeqs` 로 받는다 — 바뀐 것이 없으면
 * 번호를 쓰지 않으니 `changeSeq` 에 빈틈이 생기지 않는다.
 */
export async function lockChangeSeqs(tx: SqlExecutor, userId: string): Promise<number> {
  const rows = (await tx.execute(sql`
    INSERT INTO "seedbook"."user_sync_state" ("userId", "seq")
    VALUES (${userId}, 0)
    ON CONFLICT ("userId") DO UPDATE SET "seq" = "user_sync_state"."seq"
    RETURNING "seq"
  `)) as Array<{ seq: string | number }>;
  return Number(rows[0]?.seq ?? 0);
}

/** 사용자의 지금 번호 (커밋된 값). 행이 없으면 0. 잠그지 않는다. */
export async function currentChangeSeq(tx: SqlExecutor, userId: string): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT "seq" FROM "seedbook"."user_sync_state" WHERE "userId" = ${userId}
  `)) as Array<{ seq: string | number }>;
  return Number(rows[0]?.seq ?? 0);
}
