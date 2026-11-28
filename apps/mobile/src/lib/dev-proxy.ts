/**
 * 앱 dev 서버(Vite, `vite.config.ts`)가 Next(apps/web dev)로 넘기는 규칙. 브라우저는 Vite 포트 하나만
 * 열고, Vite 가 직접 답하는 경로(아래 `VITE_PATH`)와 앱 경로(`/home`·`/accounts/...` 등, SPA) 밖은 모두 Next 로 간다
 * — 소개·약관·`/dev/*` 페이지와 그 `/_next/*` 청크, `/api`, 아이콘·manifest 등.
 *
 * 순수 함수만 둔다 (vite.config.ts 와 테스트가 함께 쓴다).
 */

/** Vite 가 직접 답하는 경로 (모듈·HMR 클라이언트·deps·빌드 번들 폴더·index.html). */
const VITE_PATH = /^\/(@|src\/|node_modules\/|_app\/|index\.html$|__)/;

export function isVitePath(pathname: string): boolean {
  return VITE_PATH.test(pathname);
}

/**
 * Next dev 의 HMR websocket. Next 16 (Turbopack) 은 `/_next/hmr`, webpack 은 `/_next/webpack-hmr` 다.
 * 이 연결이 열리지 않으면 Turbopack dev 페이지는 hydrate 되지 않는다 (서버 HTML 만 보이고 캔버스·버튼이
 * 동작하지 않는다).
 */
const NEXT_HMR_WEBSOCKET = "^/_next/(webpack-)?hmr(\\?|$)";

export type DevProxyRoute = { target: string; ws?: boolean };

/**
 * Vite `server.proxy` 설정. 키 순서가 우선순위다 — websocket upgrade 는 `ws` 인 규칙만 넘기고, Vite 자기
 * HMR websocket(`/`)은 어느 `ws` 규칙에도 맞지 않아 Vite 가 받는다.
 */
export function devProxyRoutes(apiTarget: string): Record<string, DevProxyRoute> {
  return {
    [NEXT_HMR_WEBSOCKET]: { target: apiTarget, ws: true },
    [`^(?!${VITE_PATH.source.slice(1)}).*`]: { target: apiTarget },
  };
}
