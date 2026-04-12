/// <reference types="vitest" />

import { resolve } from "path";
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
    exclude: ["**/node_modules/**", "e2e/**", "**/.next/**"],
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
