/**
 * 모바일 / 데스크탑 렌더링 분기 규칙.
 *
 * 앱 화면은 모바일 UI (Vite SPA, SEED Design) 하나뿐이다. 모바일 UA 는 웹 서버 `apps/web/proxy.ts`
 * 에서 URL 을 유지한 채 앱 화면(`rewrite`, SPA 의 index.html)을 받고, 데스크탑은 앱 경로에 들어오면 소개 페이지(`/`)로
 * 보낸다. 태블릿도 모바일 화면을 받는다.
 *
 * 이 파일은 순수 함수만 둔다 — 웹 서버 proxy, 앱 dev 서버(vite.config.ts), 테스트가 함께 쓴다.
 */

export type DeviceKind = "mobile" | "desktop";

/**
 * 데스크탑 브라우저에서 모바일 화면을 쓰고 싶을 때 쓰는 쿠키 (`mobile`). 예전에는
 * `desktop` 으로 휴대폰에서 PC 화면을 강제할 수 있었지만, PC 앱 화면이 없어져 무시한다.
 */
export const VIEW_OVERRIDE_COOKIE = "seedbook.view";

/** 옛 Next 모바일 트리 prefix. 지금은 공개 URL 로 돌려보내기만 한다 (옛 북마크). */
export const MOBILE_TREE_PREFIX = "/m";

/** 모바일 홈 (총 평가금액·통계). */
const MOBILE_HOME = "/assets";

/** 저장소 모드·백업 설정. 예전 PC 관리 화면(`/admin`)도 여기로 보낸다. */
const MOBILE_SETTINGS = "/assets/settings";
const LEGACY_ADMIN = "/admin";

/** 데스크탑에서 앱 경로로 들어오면 보낼 소개 페이지. */
const LANDING = "/";

const MOBILE_SUPPORTED_PATTERNS = [
  /^\/assets$/,
  /^\/assets\/investments$/,
  /^\/assets\/investments\/[^/]+$/,
  /^\/assets\/portfolio$/,
  /^\/assets\/portfolio\/[^/]+$/,
  /^\/assets\/rebalancing$/,
  // 계좌 리밸런싱 계산(`/:accountId`) 과 새 리밸런싱(`/new`).
  /^\/assets\/rebalancing\/[^/]+$/,
  /^\/assets\/rebalancing\/sessions\/[^/]+$/,
  // 리밸런싱 매매 하나의 체결 수량·가격 입력.
  /^\/assets\/rebalancing\/sessions\/[^/]+\/trades\/[^/]+$/,
  /^\/assets\/settings$/,
  // 설정 하위 화면. 로그인 수단 연결은 제공자 화면을 다녀와 이 주소로 돌아온다.
  /^\/assets\/settings\/(login-methods|profile|storage|data|delete-account|terms|privacy)$/,
  // 이용약관·개인정보처리방침의 한 버전.
  /^\/assets\/settings\/(terms|privacy)\/[^/]+$/,
];

/** 앱 경로 prefix. 모바일 미지원 경로는 모바일 홈, 데스크탑은 소개 페이지로 보낸다. */
const APP_PATH_PREFIXES = ["/assets", LEGACY_ADMIN];

/**
 * 네이티브 앱 셸(`apps/mobile`, Capacitor)이 WebView User-Agent 뒤에 붙이는 표시.
 * `apps/mobile/capacitor.config.ts` 의 `appendUserAgent` 와 같아야 한다.
 */
export const NATIVE_APP_UA_MARKER = "SeedbookApp";

export function isNativeAppUserAgent(userAgent: string | undefined): boolean {
  return userAgent?.includes(NATIVE_APP_UA_MARKER) ?? false;
}

/** iPad 앱은 UA 가 Mac 처럼 보일 수 있어, 앱 중 Android 가 아닌 것을 iOS 앱으로 본다. */
export function isIosAppUserAgent(userAgent: string | undefined): boolean {
  return isNativeAppUserAgent(userAgent) && !userAgent?.includes("Android");
}

export function resolveDeviceKind(input: {
  deviceType: string | undefined;
  userAgent?: string;
  override?: string;
}): DeviceKind {
  if (input.override === "mobile") return "mobile";
  // 네이티브 앱은 모바일 UI 만 담는다 — iPad 앱도 모바일 화면.
  if (isNativeAppUserAgent(input.userAgent)) return "mobile";
  return input.deviceType === "mobile" || input.deviceType === "tablet" ? "mobile" : "desktop";
}

export type MobileRouteDecision =
  | { type: "pass" }
  | { type: "rewrite"; pathname: string }
  | { type: "redirect"; pathname: string };

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function decideMobileRoute(
  pathname: string,
  kind: DeviceKind,
  options: { nativeApp?: boolean } = {}
): MobileRouteDecision {
  // 네이티브 앱은 설치 PWA 의 start_url 처럼 랜딩 대신 홈으로 연다. (Capacitor 의
  // appStartPath 는 iOS 에서 원격 server.url 과 함께 쓸 수 없어 서버에서 보낸다.)
  if (options.nativeApp && pathname === "/") {
    return { type: "redirect", pathname: MOBILE_HOME };
  }

  // 내부 트리를 직접 노출하지 않는다 — 공개 URL 로 돌려보낸 뒤 다시 판별.
  if (matchesPrefix(pathname, MOBILE_TREE_PREFIX)) {
    const stripped = pathname.slice(MOBILE_TREE_PREFIX.length);
    return { type: "redirect", pathname: stripped === "" ? "/" : stripped };
  }

  const isAppPath = APP_PATH_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));

  if (kind === "desktop") {
    return isAppPath ? { type: "redirect", pathname: LANDING } : { type: "pass" };
  }

  if (MOBILE_SUPPORTED_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return { type: "rewrite", pathname: `${MOBILE_TREE_PREFIX}${pathname}` };
  }

  if (matchesPrefix(pathname, LEGACY_ADMIN)) {
    return { type: "redirect", pathname: MOBILE_SETTINGS };
  }

  if (isAppPath) {
    return { type: "redirect", pathname: MOBILE_HOME };
  }

  return { type: "pass" };
}
