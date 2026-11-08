import { sql, type SQL } from "drizzle-orm";

/** `db` 와 트랜잭션 `tx` 둘 다 받을 수 있는 최소 실행기. */
type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

/**
 * `investment_account.portfolioId` 를 `portfolio.accountIds[]` 에 맞춘다.
 *
 * 전환 기간에는 클라이언트 envelope 의 원본이 여전히 `portfolio.accountIds` 다.
 * 투자 계좌와 포트폴리오는 서로 다른 PUT 으로 따로 저장되므로 (새 계좌와 연결이 어느
 * 순서로 도착할지 모름) 두 translator 모두 쓰기 끝에 이 함수를 불러 나중에 도착한 쪽이
 * 연결을 완성하게 한다. `userId` 없이 부르면 전체 사용자 대상 (backfill 스크립트).
 *
 * 규칙 (클라이언트 `dedupePortfolioLinks` 와 동일):
 *   - 같은 사용자 소유의 포트폴리오만 매칭한다 — `accountIds` 는 클라이언트가 보낸 값이라
 *     다른 사용자의 계좌 id 가 섞여 있어도 연결되지 않는다.
 *   - 여러 포트폴리오에 들어 있으면 `updatedAt` 최신 → `id` 순으로 하나를 고른다.
 *   - 어떤 포트폴리오에도 없는 계좌는 NULL 로 되돌린다.
 */
export async function syncAccountPortfolioLinks(
  executor: SqlExecutor,
  userId?: string
): Promise<void> {
  const userFilter = userId === undefined ? sql`TRUE` : sql`a."userId" = ${userId}`;
  await executor.execute(sql`
    UPDATE "seedbook"."investment_account" AS ia
    SET "portfolioId" = linked."portfolioId"
    FROM (
      SELECT a."id" AS "accountId", (
        SELECT p."id"
        FROM "seedbook"."portfolio" AS p
        WHERE p."userId" = a."userId"
          AND a."id" = ANY (p."accountIds")
        ORDER BY p."updatedAt" DESC, p."id"
        LIMIT 1
      ) AS "portfolioId"
      FROM "seedbook"."investment_account" AS a
      WHERE ${userFilter}
    ) AS linked
    WHERE ia."id" = linked."accountId"
      AND ia."portfolioId" IS DISTINCT FROM linked."portfolioId"
  `);
}
