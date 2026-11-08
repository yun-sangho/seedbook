/// <reference types="vitest" />

import { resolve } from "path";
import { defineConfig } from "vitest/config";

/**
 * DB 통합 테스트 (`*.db.test.ts`). 실제 Postgres 가 필요하다:
 *
 *   pnpm db:dev:up                          # 로컬 postgres
 *   pnpm --filter @seedbook/web test:db
 *
 * 기본 `test` 실행에서는 제외된다 (vitest.config.ts).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.db.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    globalSetup: ["./test/db/global-setup.ts"],
    // 테스트 파일들이 같은 DB 를 쓴다 — 사용자 단위로 격리하지만 연결 수를 아끼려고 순차 실행.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname),
      "@web": resolve(__dirname),
    },
  },
});
