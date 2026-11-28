/**
 * 동기화 v2 expand (v2-2) backfill — 마이그레이션 0024 가 더한 열·`rebalancing_task` 를 채운다.
 * 무엇을 어떻게 채우는지는 `src/sync-v2-backfill.ts`. 멱등이라 여러 번 돌려도 된다 — v1 쓰기가
 * 새 열을 기본값으로 남기므로, v2 엔드포인트로 넘어가기 직전에 한 번 더 돌린다.
 *
 *   pnpm --filter @seedbook/database db:backfill:sync-v2
 */

import { closeDb, db } from "../src/client";
import { backfillSyncV2 } from "../src/sync-v2-backfill";
import { syncV2Keys } from "./sync-v2-keys";

async function main() {
  const summary = await backfillSyncV2(db, syncV2Keys);
  console.log("sync v2 backfilled:", summary);
  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
