import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// next.config.ts is evaluated as an ES module (package.json "type": "module"),
// so __dirname is not available. Derive it from import.meta.url.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Produce a self-contained Node server bundle under .next/standalone,
  // so we can run the app in any Docker host without Vercel.
  output: "standalone",
  // Monorepo: trace files from the repo root so pnpm workspace symlinks
  // (e.g. @seedbook/database) are included in the bundle.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Docker for Mac 처럼 bind mount 의 fs change 이벤트가 컨테이너로 전달되지
  // 않는 환경에서 turbopack HMR 이 동작하도록 폴링 fallback 을 켠다. 호스트에서
  // 직접 실행할 때는 이 env 가 비어 있어 native 워처(즉시 반응)를 그대로 쓴다.
  watchOptions: process.env.NEXT_DEV_POLL_INTERVAL_MS
    ? { pollIntervalMs: Number(process.env.NEXT_DEV_POLL_INTERVAL_MS) }
    : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
