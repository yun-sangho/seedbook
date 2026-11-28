import { type NextRequest, NextResponse, userAgent } from "next/server";
import {
  buildAppContentSecurityPolicy,
  buildContentSecurityPolicy,
  CSP_NONCE_HEADER,
  createCspNonce,
} from "@mobile/lib/csp";
import {
  decideMobileRoute,
  isNativeAppUserAgent,
  resolveDeviceKind,
  VIEW_OVERRIDE_COOKIE,
} from "@mobile/lib/device";

/**
 * 앱 화면 (Vite SPA, apps/mobile) 의 index.html. 빌드가 `public/_app/` 에 복사한다 (scripts/copy-app.mjs).
 */
const APP_INDEX = "/_app/index.html";

/**
 * UA 기반 모바일/데스크탑 분기. 모바일은 URL 을 유지한 채 앱 화면(SPA 의 index.html)을 받고, 화면은
 * 앱의 스택이 URL 을 보고 그린다. 규칙은 `apps/mobile/src/lib/device.ts` 참조 (`rewrite` = 앱 화면).
 *
 * Next 가 그리는 페이지(소개·약관)에는 응답마다 새 nonce 로 CSP 를 건다 (`lib/csp.ts`). 요청 헤더에도
 * 같은 정책을 넣어야 Next.js 가 nonce 를 읽어 자기 스크립트에 붙인다. 앱 화면은 정적 파일이라 nonce
 * 없는 앱 정책을 건다 (index.html 의 meta 와 같은 정책 + frame-ancestors).
 */
export function proxy(request: NextRequest) {
  const agent = userAgent(request);
  const kind = resolveDeviceKind({
    deviceType: agent.device.type,
    userAgent: agent.ua,
    override: request.cookies.get(VIEW_OVERRIDE_COOKIE)?.value,
  });
  const decision = decideMobileRoute(request.nextUrl.pathname, kind, {
    nativeApp: isNativeAppUserAgent(agent.ua),
  });
  const isDev = process.env.NODE_ENV === "development";

  if (decision.type === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    return NextResponse.redirect(url);
  }

  if (decision.type === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = APP_INDEX;
    url.search = "";
    const response = NextResponse.rewrite(url);
    response.headers.set(
      "Content-Security-Policy",
      buildAppContentSecurityPolicy({ isDev, meta: false })
    );
    // 배포마다 번들 파일 이름이 바뀐다 — 옛 index.html 을 캐시해 지워진 번들을 부르지 않게 한다.
    response.headers.set("Cache-Control", "no-cache");
    return response;
  }

  const nonce = createCspNonce();
  const policy = buildContentSecurityPolicy({ nonce, isDev });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_NONCE_HEADER, nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // API, Next 내부 자산, 확장자가 있는 정적 파일(앱 번들 `/_app/*` 포함)은 제외.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
