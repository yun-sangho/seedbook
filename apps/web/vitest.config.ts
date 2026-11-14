/// <reference types="vitest" />

import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{js,jsx,ts,tsx}"],
    // .next/standalone/** is excluded because Next.js's file tracer copies
    // workspace source (including *.test.ts) into that directory, and vitest
    // would otherwise try to run those copies with unresolvable imports.
    // *.db.test.ts 는 실제 Postgres 가 필요해 `test:db` (vitest.db.config.ts) 로 따로 돈다.
    exclude: ["**/node_modules/**", "e2e/**", "**/.next/**", "**/*.db.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname),
      "@web": resolve(__dirname),
    },
  },
});
