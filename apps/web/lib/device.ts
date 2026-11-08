/**
 * 모바일 / 데스크탑 렌더링 분기 규칙.
 *
 * 모바일 UA 는 `middleware.ts` 에서 `/m/...` 트리로 rewrite 되어 SEED Design 기반
 * 화면을 받는다 (URL 은 그대로). 데스크탑은 기존 shadcn 화면을 그대로 쓴다.
 * 모바일은 현재 홈·계좌·리밸런싱·포트폴리오만 지원하므로 나머지 앱 경로는 모바일 홈으로 보낸다.
 *
 * 이 파일은 순수 함수만 둔다 — middleware(edge) 와 테스트에서 함께 쓰기 위함.
 */

export type DeviceKind = "mobile" | "desktop";

/** 사용자가 UA 판별을 덮어쓰고 싶을 때 쓰는 쿠키 (`mobile` | `desktop`). */
export const VIEW_OVERRIDE_COOKIE = "seedbook.view";

export const MOBILE_TREE_PREFIX = "/m";

/** 모바일 홈 (총 평가금액·통계). 데스크탑에서는 같은 URL 이 자산 개요 화면이다. */
const MOBILE_HOME = "/assets";

/** 모바일에만 있는 화면 (계좌 상세). 데스크탑에서 열리면 투자 목록으로 보낸다. */
const MOBILE_ONLY_PATTERNS = [/^\/assets\/investments\/[^/]+$/];
const DESKTOP_ACCOUNT_HOME = "/assets/investments";

/**
 * 모바일 전용 리밸런싱 화면 (계좌 단위). 데스크탑은 포트폴리오 화면 안에서
 * 리밸런싱을 보여주므로 포트폴리오 목록으로 보낸다.
 */
const REBALANCING_LIST = /^\/assets\/rebalancing$/;
const REBALANCING_DETAIL = /^\/assets\/rebalancing\/[^/]+$/;
const DESKTOP_REBALANCING_HOME = "/assets/portfolio";

function isRebalancingPath(pathname: string): boolean {
  return REBALANCING_LIST.test(pathname) || REBALANCING_DETAIL.test(pathname);
}

const MOBILE_SUPPORTED_PATTERNS = [
  ...MOBILE_ONLY_PATTERNS,
  REBALANCING_LIST,
  REBALANCING_DETAIL,
  /^\/assets$/,
  /^\/assets\/investments$/,
  /^\/assets\/portfolio$/,
  /^\/assets\/portfolio\/[^/]+$/,
];

/** `(app)` 그룹 아래의 앱 경로 prefix. 모바일 미지원 시 MOBILE_HOME 으로 보낸다. */
const APP_PATH_PREFIXES = ["/assets", "/asset-plan", "/asset-plan-list", "/admin"];

export function resolveDeviceKind(input: {
  deviceType: string | undefined;
  override?: string;
}): DeviceKind {
  if (input.override === "mobile" || input.override === "desktop") return input.override;
  // 태블릿은 데스크탑 UI 를 감당할 폭이 있어 desktop 으로 취급한다.
  return input.deviceType === "mobile" ? "mobile" : "desktop";
}

export type MobileRouteDecision =
  | { type: "pass" }
  | { type: "rewrite"; pathname: string }
  | { type: "redirect"; pathname: string };

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function decideMobileRoute(pathname: string, kind: DeviceKind): MobileRouteDecision {
  // 내부 트리를 직접 노출하지 않는다 — 공개 URL 로 돌려보낸 뒤 다시 판별.
  if (matchesPrefix(pathname, MOBILE_TREE_PREFIX)) {
    const stripped = pathname.slice(MOBILE_TREE_PREFIX.length);
    return { type: "redirect", pathname: stripped === "" ? "/" : stripped };
  }

  if (kind === "desktop") {
    if (isRebalancingPath(pathname)) {
      return { type: "redirect", pathname: DESKTOP_REBALANCING_HOME };
    }
    return MOBILE_ONLY_PATTERNS.some((pattern) => pattern.test(pathname))
      ? { type: "redirect", pathname: DESKTOP_ACCOUNT_HOME }
      : { type: "pass" };
  }

  if (MOBILE_SUPPORTED_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return { type: "rewrite", pathname: `${MOBILE_TREE_PREFIX}${pathname}` };
  }

  if (APP_PATH_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return { type: "redirect", pathname: MOBILE_HOME };
  }

  return { type: "pass" };
}
