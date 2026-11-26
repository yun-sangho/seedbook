/**
 * 레포의 약관·개인정보처리방침 버전(`src/legal/`)을 `legal_document` 에 공개한다. 멱등 — 이미 공개한
 * 버전은 건너뛰고, 내용이 바뀌었으면 아무것도 넣지 않고 실패한다 (공개한 버전은 고치지 않는다).
 *
 *   pnpm --filter @seedbook/database db:legal:publish
 *   pnpm --filter @seedbook/database db:legal:publish --allow-short-notice   # 7일 사전 안내 생략 (출시 전)
 *
 * 배포 뒤 서버에서: docker compose exec stock-crawler pnpm --filter @seedbook/database db:legal:publish
 */

import { db } from "../src/client";
import { LEGAL_DOCUMENT_VERSIONS } from "../src/legal";
import { LegalPublishError, publishLegalDocuments } from "../src/legal/publish";

async function main() {
  const allowShortNotice = process.argv.includes("--allow-short-notice");
  const result = await publishLegalDocuments(db, LEGAL_DOCUMENT_VERSIONS, {
    now: new Date(),
    allowShortNotice,
  });
  console.log("published:", result.published.length ? result.published.join(", ") : "(none)");
  console.log("unchanged:", result.unchanged.length ? result.unchanged.join(", ") : "(none)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof LegalPublishError ? err.message : err);
  process.exit(1);
});
