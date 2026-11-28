/**
 * 앱 번들로 뜬 네이티브 앱인지. 앱은 화면(Vite 빌드 `dist/`)을 바이너리에 담아 앱 origin
 * (iOS `capacitor://localhost`, Android `https://localhost`) 에서 띄운다 (`capacitor.config.ts`).
 *
 * 번들 앱이 아닌 경우:
 * - 브라우저 (모바일 웹·데스크탑 개발) — 웹 서버가 화면과 API 를 같은 origin 에서 준다.
 * - 옛 앱 셸 (`server.url` 로 운영 서버를 띄우던 바이너리) 과 dev live-reload (`CAP_SERVER_URL`) —
 *   네이티브지만 화면을 서버에서 받으므로 origin 이 서버다.
 */

import { decideMobileRoute } from "../device";

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

/** origin 만으로 가른다 (테스트용으로 나눔). */
export function isBundledAppOrigin(location: Pick<Location, "protocol" | "hostname">): boolean {
  if (location.protocol === "capacitor:") return true;
  return location.protocol === "https:" && location.hostname === "localhost";
}

/**
 * 앱 셸이 주입한 전역(`window.Capacitor`, 페이지 스크립트보다 먼저 들어온다) 과 origin 으로 판정한다 —
 * 브라우저에서는 `@capacitor/core` 를 불러오지 않는다.
 */
export function isBundledApp(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.isNativePlatform?.() === true && isBundledAppOrigin(window.location);
}

/**
 * 번들 앱이 열 주소. 웹 서버가 하던 경로 정리(`decideMobileRoute`, `apps/web/proxy.ts`)를 앱이 한다 —
 * 앱 셸은 `/` 로 시작하고, 앱 밖 경로(소개·약관 등, 번들에 없다)는 홈으로 보낸다.
 */
export function bundledAppPath(pathname: string): string {
  let current = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  // 리다이렉트는 많아야 두 번 이어진다 (`/m` → `/` → `/assets`).
  for (let hop = 0; hop < 3; hop++) {
    const decision = decideMobileRoute(current, "mobile", { nativeApp: true });
    if (decision.type === "rewrite") return current;
    current = decision.type === "redirect" ? decision.pathname : "/";
  }
  return current;
}
