import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

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

// PWA 서비스 워커. dev(turbopack) 에서는 webpack 플러그인이 돌지 않으므로 끄고,
// prod 빌드에서만 app/sw.ts → public/sw.js 를 생성한다. 정책은 app/sw.ts 참고.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // 온라인 복귀 시 자동 새로고침은 작성 중인 폼을 날릴 수 있어 끈다. 오프라인
  // 안내 페이지만 자체적으로 online 이벤트에 새로고침한다.
  reloadOnOnline: false,
  // 오프라인 fallback 페이지. 배포마다 revision 을 바꿔 최신본을 다시 받는다.
  // 주의: additionalPrecacheEntries 를 주면 public/ glob precache 는 생략된다
  // (온라인 전용이라 의도한 동작 — _next/static 만 precache).
  additionalPrecacheEntries: [{ url: "/offline", revision: randomUUID() }],
});

export default withSerwist(nextConfig);
