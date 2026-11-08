/**
 * 일회성 backfill: `portfolio.accountIds[]` → `investment_account.portfolioId`.
 *
 * 마이그레이션 0003 은 컬럼만 추가한다 (마이그레이션은 drizzle-kit 생성분만 쓴다).
 * 이후에는 translator 가 쓰기마다 맞추므로, 이 스크립트는 배포 직후 아직 쓰기가 없던
 * 사용자의 연결을 채우는 용도다. 멱등 — 여러 번 돌려도 같은 결과.
 *
 *   pnpm --filter @seedbook/database db:backfill:account-portfolio
 */

import { sql } from "drizzle-orm";
import { syncAccountPortfolioLinks } from "../src/account-portfolio-links";
import { db } from "../src/client";

async function main() {
  await syncAccountPortfolioLinks(db);
  const [summary] = await db.execute<{ linked: string; total: string }>(sql`
    SELECT count(*) FILTER (WHERE "portfolioId" IS NOT NULL) AS linked, count(*) AS total
    FROM "seedbook"."investment_account"
  `);
  console.log("account-portfolio links backfilled:", summary);
  process.exit(0);
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
