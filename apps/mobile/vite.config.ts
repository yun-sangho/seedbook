import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { buildAppContentSecurityPolicy } from "./src/lib/csp.ts";
import { devProxyRoutes, isVitePath } from "./src/lib/dev-proxy.ts";
import { decideMobileRoute } from "./src/lib/device.ts";
import { iosStartupImages } from "./src/lib/ios-splash.ts";
import { BUNDLED_APP_API_BASE_URL } from "./src/lib/native/bundled-app-api.ts";

/**
 * 앱 화면 (Vite + React SPA). 화면은 `src/main.tsx` 에서 시작하고, API·인증·소개·약관은 웹 서버
 * (apps/web, Next) 가 맡는다.
 *
 * - 개발: `pnpm dev` 가 이 dev 서버(슬롯 포트 `PORT`)와 Next(`API_PORT`)를 함께 띄운다
 *   (scripts/worktree.mjs). 브라우저는 이 포트 하나만 연다 — 앱 경로(`/assets/...`)는 SPA 를 주고,
 *   그 밖(`/api`, 소개 `/`, 약관, 아이콘·manifest·sw.js 등)은 Next 로 넘긴다. 같은 origin 이라 쿠키
 *   세션·"개발용 빠른 로그인"·카카오 로그인(BETTER_AUTH_URL = 이 포트)이 그대로 된다.
 * - 빌드: `dist/` 에 `index.html` + `_app/` (번들). 앱 경로 `/assets/...` 와 겹치지 않도록 번들
 *   폴더를 `_app` 으로 둔다. 운영 웹은 이 결과를 Next 가 같이 서빙한다 (apps/web/scripts/copy-app.mjs).
 */

const ROOT = import.meta.dirname;
const DOMAIN_SRC = resolve(ROOT, "../../packages/domain/src");
const APP_DIR = "_app";
/** 앱 버전 = 이 패키지의 `version` (iOS·Android marketing version 과 같다, `app-version.test.ts`). */
const APP_VERSION: string = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version;

/**
 * 앱 경로를 운영과 같은 규칙(`decideMobileRoute`, 웹 서버 proxy 와 같은 함수)으로 가른다. 개발에서는
 * 어떤 브라우저든 모바일로 본다 — 데스크탑 브라우저에서도 `seedbook.view` 쿠키 없이 앱 화면이 열린다.
 */
function appRoutes(): Plugin {
  return {
    name: "seedbook:app-routes",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (isVitePath(url.pathname) || (req.method !== "GET" && req.method !== "HEAD")) {
          return next();
        }
        const redirect = (status: number, pathname: string) => {
          res.statusCode = status;
          res.setHeader("Location", `${pathname}${url.search}`);
          res.end();
        };
        // Next 처럼 끝의 `/` 를 떼어 보낸다 (스택이 주소창에 `/assets/investments/` 처럼 적는다).
        if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
          return redirect(308, url.pathname.replace(/\/+$/, ""));
        }
        const decision = decideMobileRoute(url.pathname, "mobile");
        if (decision.type === "redirect") return redirect(307, decision.pathname);
        if (decision.type === "rewrite") req.url = "/index.html";
        next();
      });
    },
  };
}

const CHARSET_META = '<meta charset="UTF-8" />';

/**
 * index.html 에 iOS 스플래시와 (빌드에만) CSP meta 를 넣는다. CSP meta 는 뒤에 오는 요소에만 걸리므로
 * charset 바로 뒤, 스크립트보다 앞에 둔다. dev 는 Vite 가 인라인 스크립트를 넣어 CSP 를 걸지 않는다.
 * 앱 번들은 API 서버가 다른 origin 이라 그 주소를 connect-src 에 더한다 (`lib/api-client.ts`).
 */
function appHtml({ isDev, apiBaseUrl }: { isDev: boolean; apiBaseUrl: string }): Plugin {
  return {
    name: "seedbook:app-html",
    transformIndexHtml(html, context) {
      const tags = iosStartupImages().map(({ url, media }) => ({
        tag: "link",
        attrs: { rel: "apple-touch-startup-image", href: url, media },
        injectTo: "head" as const,
      }));
      if (context.server) return { html, tags };
      if (!html.includes(CHARSET_META)) throw new Error(`index.html 에 ${CHARSET_META} 가 없다`);
      const policy = buildAppContentSecurityPolicy({
        isDev,
        meta: true,
        apiOrigins: [new URL(apiBaseUrl).origin],
      });
      const csp = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
      return { html: html.replace(CHARSET_META, `${CHARSET_META}\n    ${csp}`), tags };
    },
  };
}

export default defineConfig(({ mode }) => {
  const port = Number(process.env.PORT ?? 4001);
  const apiTarget = `http://localhost:${process.env.API_PORT ?? port + 1}`;
  const apiBaseUrl = process.env.SEEDBOOK_API_BASE_URL || BUNDLED_APP_API_BASE_URL;
  return {
    plugins: [react(), appRoutes(), appHtml({ isDev: mode !== "production", apiBaseUrl })],
    resolve: {
      alias: {
        "@mobile": resolve(ROOT, "src"),
        "@seedbook/domain": DOMAIN_SRC,
      },
    },
    // 앱 코드는 Next 와 같이 쓰던 `process.env.*` 를 그대로 읽는다 — 빌드 때 값을 넣는다. 테스트는
    // `vi.stubEnv` 로 바꿔 보므로 넣지 않는다.
    define:
      mode === "test"
        ? {}
        : {
            "process.env.NODE_ENV": JSON.stringify(
              mode === "production" ? "production" : "development"
            ),
            "process.env.SEEDBOOK_API_BASE_URL": JSON.stringify(
              process.env.SEEDBOOK_API_BASE_URL ?? ""
            ),
            "process.env.SEEDBOOK_APP_BUILD": JSON.stringify(process.env.SEEDBOOK_APP_BUILD ?? ""),
            "process.env.SEEDBOOK_APP_VERSION": JSON.stringify(APP_VERSION),
          },
    server: {
      port,
      strictPort: true,
      // 네이티브 셸(에뮬레이터 10.0.2.2·실기기 LAN IP)이 붙을 수 있게 모든 주소에서 듣는다 (Next dev 와 같다).
      host: true,
      // CORS 는 Next(`apps/web/proxy.ts`, 앱 origin 만 허용)가 정한다. Vite 기본 CORS 는 localhost origin 만 받아
      // 개발용 앱(Seedbook Dev, origin `capacitor://localhost`)의 `/api` preflight 를 Next 에 넘기기 전에 막는다.
      cors: false,
      // 네이티브 빌드 산출물(fastlane `build/`, cap sync 가 복사한 번들)이 바뀔 때 페이지를 새로 고치지 않는다.
      watch: { ignored: ["**/build/**", "**/ios/**", "**/android/**"] },
      // 앱 경로 밖(소개·약관·`/dev/*`·`/_next/*`·`/api` 등)과 Next dev HMR websocket 을 Next 로.
      proxy: devProxyRoutes(apiTarget),
    },
    build: {
      outDir: "dist",
      assetsDir: APP_DIR,
      // 첫 JS(React·SEED·stackflow·동기화)와 three 정원이 각각 500KB 를 조금 넘는다 (gzip 200KB 안쪽).
      chunkSizeWarningLimit: 700,
      rolldownOptions: {
        onwarn(warning, warn) {
          // Next 와 같이 쓰는 파일의 "use client" — Vite 에서는 뜻이 없다.
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          warn(warning);
        },
      },
    },
  };
});
