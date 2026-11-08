import "@seed-design/css/base.css";
import type { Metadata, Viewport } from "next";
import { AuthGate } from "@web/components/auth-gate";
import { HydrationGate } from "@web/components/hydration-gate";
import { SeedColorScheme } from "@web/components/mobile/seed-color-scheme";
import { iosStartupImages } from "@web/lib/ios-splash";
import { MobileStack } from "./_stack/mobile-stack";

/**
 * 모바일 전용 트리. middleware 가 모바일 UA 요청을 URL 유지한 채 `/m/...` 로
 * rewrite 한다 (`lib/device.ts`). SEED Design CSS 는 이 레이아웃에서만 로드되어
 * 데스크탑 번들에는 섞이지 않는다.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // 앱바(bg-layer-default) 색과 맞춰 설치 앱의 상태바가 이어져 보이게 한다.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#16171b" },
  ],
};

/**
 * iOS 홈 화면 앱 (Safari "홈 화면에 추가") 설정. 아이콘은 app/apple-icon.png,
 * 스플래시는 lib/ios-splash.ts (이미지는 scripts/generate-pwa-images.mjs 로 생성).
 */
export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    title: "Seedbook",
    statusBarStyle: "default",
    startupImage: iosStartupImages(),
  },
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SeedColorScheme />
      <HydrationGate>
        <AuthGate>
          {/* 화면은 스택이 URL 을 보고 그린다. children(페이지)은 경로만 받아주는 빈 페이지. */}
          <MobileStack />
          {children}
        </AuthGate>
      </HydrationGate>
    </>
  );
}
