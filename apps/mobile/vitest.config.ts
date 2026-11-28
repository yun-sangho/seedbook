/// <reference types="vitest" />

import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      // SEED 컴포넌트는 자기 CSS 를 import 한다 — Node 가 직접 읽지 못해 Vite 로 변환한다.
      server: { deps: { inline: [/@seed-design\//] } },
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  })
);
