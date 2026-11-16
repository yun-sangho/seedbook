import { type NextRequest, NextResponse, userAgent } from "next/server";
import { buildContentSecurityPolicy, CSP_NONCE_HEADER, createCspNonce } from "@web/lib/csp";
import {
  decideMobileRoute,
  isNativeAppUserAgent,
  resolveDeviceKind,
  VIEW_OVERRIDE_COOKIE,
} from "@web/lib/device";

/**
 * UA 기반 모바일/데스크탑 분기. 모바일은 URL 을 유지한 채 `/m/...` 트리(SEED
 * Design) 로 rewrite 된다. 규칙은 `lib/device.ts` 참조.
 *
 * 페이지 응답마다 새 nonce 로 CSP 를 건다 (`lib/csp.ts`). 요청 헤더에도 같은 정책을 넣어야
 * Next.js 가 nonce 를 읽어 자기 스크립트에 붙인다.
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

  if (decision.type === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    return NextResponse.redirect(url);
  }

  const nonce = createCspNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_NONCE_HEADER, nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  let response: NextResponse;
  if (decision.type === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // API, Next 내부 자산, 확장자가 있는 정적 파일은 제외.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
