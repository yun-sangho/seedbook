import "@seed-design/css/base.css";
import type { Viewport } from "next";
import { headers } from "next/headers";
import { SeedColorScheme } from "@web/components/mobile/seed-color-scheme";
import { CSP_NONCE_HEADER } from "@web/lib/csp";
import { isIosAppUserAgent } from "@web/lib/device";

/**
 * iOS 앱은 WebView 가 상태바·홈 인디케이터 뒤까지 차고, `viewport-fit=cover` 가 있어야
 * `env(safe-area-inset-*)` 가 0 이 아니다. 브라우저와 Android 앱은 화면을 알아서 안쪽에 두므로
 * 켜지 않는다 (켜면 iOS Safari 가로 모드에서 내용이 노치 뒤로 들어간다).
 */
export async function generateViewport(): Promise<Viewport> {
  const userAgent = (await headers()).get("user-agent") ?? undefined;
  return isIosAppUserAgent(userAgent) ? { viewportFit: "cover" } : {};
}

/**
 * 앱 밖 공개 페이지(소개·개인정보처리방침·오프라인). `/m` 처럼 SEED Design CSS 와 색 모드를
 * 이 트리에서만 켠다. body 는 화면 높이에 고정돼 있어 스크롤은 이 래퍼가 맡는다.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get(CSP_NONCE_HEADER) ?? undefined;
  return (
    <>
      <SeedColorScheme nonce={nonce} />
      <div className="bg-bg-layer-default text-fg-neutral h-full w-full overflow-y-auto">
        {children}
      </div>
    </>
  );
}
