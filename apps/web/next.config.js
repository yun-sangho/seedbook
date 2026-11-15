// @ts-check
import path from "node:path";
import { fileURLToPath } from "node:url";

// next.config.js is evaluated as an ES module (package.json "type": "module"),
// so __dirname is not available. Derive it from import.meta.url.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
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
  // 네이티브 앱(apps/mobile)을 로컬 dev 서버에 붙일 때 localhost 가 아닌 호스트로 접속한다
  // (Android 에뮬레이터 → 10.0.2.2, 실기기 → 맥 LAN IP). dev 서버는 기본적으로 다른 호스트의
  // 개발용 리소스 요청을 막아 화면이 하이드레이션되지 않으므로 허용해 둔다. 프로덕션에는 영향 없음.
  // 실기기는 `NEXT_DEV_ALLOWED_ORIGINS=192.168.0.10 pnpm dev` 처럼 추가한다.
  allowedDevOrigins: [
    "10.0.2.2",
    ...(process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",").map((host) => host.trim()) ?? []),
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
