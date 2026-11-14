// @ts-check
import { randomUUID } from "node:crypto";
import { generateGlobPatterns, serwist } from "@serwist/next/config";

/**
 * PWA 서비스 워커 빌드 설정 — `next build` 뒤에 `serwist build` 가 app/sw.ts 를 public/sw.js 로
 * 번들한다 (Turbopack 빌드에는 Serwist webpack 플러그인이 돌지 않아 따로 만든다). 등록은
 * `app/layout.tsx` 의 `SerwistProvider`. 정책은 app/sw.ts 참고.
 */
export default serwist.withNextConfig((nextConfig) => ({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // 온라인 전용 앱이라 빌드 정적 자산(_next/static)만 precache 한다 — public/ 파일과 미리 렌더한
  // 페이지는 넣지 않는다.
  globPatterns: generateGlobPatterns(
    nextConfig.distDir.endsWith("/") ? nextConfig.distDir : `${nextConfig.distDir}/`
  ).filter((pattern) => !pattern.startsWith("public/")),
  precachePrerendered: false,
  // 오프라인 fallback 페이지. 배포마다 revision 을 바꿔 최신본을 다시 받는다.
  additionalPrecacheEntries: [{ url: "/offline", revision: randomUUID() }],
}));
