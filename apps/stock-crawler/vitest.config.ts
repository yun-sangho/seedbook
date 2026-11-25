import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // 소스를 본다 — database 패키지를 빌드(dist)하지 않아도 테스트가 돈다.
      "@seedbook/database": resolve(__dirname, "../../packages/database/src"),
    },
  },
});
