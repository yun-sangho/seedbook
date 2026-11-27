/**
 * 일회성 정리: 이미 저장된 이름·이메일·사진·OAuth 토큰·세션 IP/User-Agent 를 지운다.
 *
 * 로그인에서 신상 정보를 받지 않게 바꾼 뒤(`src/anonymous-identity.ts`), 그 전에 저장된 행에 같은
 * 원칙을 적용한다. 멱등 — 여러 번 돌려도 같은 결과이고, 이미 고정 이메일인 사용자의 이름은 건드리지 않는다.
 *
 *   pnpm --filter @seedbook/database db:backfill:scrub-personal-info
 */

import { db } from "../src/client";
import { scrubPersonalInfo } from "../src/scrub-personal-info";

async function main() {
  const result = await scrubPersonalInfo(db);
  console.log("personal info scrubbed:", result);
  process.exit(0);
}

main().catch((err) => {
  console.error("scrub failed:", err);
  process.exit(1);
});
