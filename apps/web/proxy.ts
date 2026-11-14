import { type NextRequest, NextResponse, userAgent } from "next/server";
import { decideMobileRoute, resolveDeviceKind, VIEW_OVERRIDE_COOKIE } from "@web/lib/device";

/**
 * UA 기반 모바일/데스크탑 분기. 모바일은 URL 을 유지한 채 `/m/...` 트리(SEED
 * Design) 로 rewrite 된다. 규칙은 `lib/device.ts` 참조.
 */
export function proxy(request: NextRequest) {
  const kind = resolveDeviceKind({
    deviceType: userAgent(request).device.type,
    override: request.cookies.get(VIEW_OVERRIDE_COOKIE)?.value,
  });
  const decision = decideMobileRoute(request.nextUrl.pathname, kind);

  if (decision.type === "pass") return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = decision.pathname;
  return decision.type === "rewrite" ? NextResponse.rewrite(url) : NextResponse.redirect(url);
}

export const config = {
  // API, Next 내부 자산, 확장자가 있는 정적 파일은 제외.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
