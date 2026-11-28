import "./globals.css";
import "@seed-design/css/base.css";
// SEED 브랜드 토큰을 Seedbook 잎 초록으로 (base.css 바로 뒤, 소개 사이트도 같은 파일).
import "./seed-brand.css";
import { StrictMode, Suspense } from "react";
import { MobileStack } from "@mobile/app/_stack/mobile-stack";
import { AuthGate } from "@mobile/components/auth-gate";
import { HydrationGate } from "@mobile/components/hydration-gate";
import { LiveUpdateRunner } from "@mobile/components/live-update-runner";
import { BiometricLoginOffer } from "@mobile/components/mobile/biometric-login";
import { useSeedColorScheme } from "@mobile/components/mobile/seed-color-scheme";
import { SystemBackButton } from "@mobile/components/mobile/system-back-button";
import { ThemeProvider } from "@mobile/components/theme-provider";
import { UpdateGate } from "@mobile/components/update-gate";
import { bundledAppPath, isBundledApp } from "@mobile/lib/native/bundled-app";
import { registerServiceWorker } from "@mobile/lib/service-worker";
import { createRoot } from "react-dom/client";

/**
 * 앱 화면의 시작점 (옛 Next `app/layout.tsx` + `app/m/layout.tsx`). 화면은 Stackflow 스택이
 * URL 을 보고 그린다 (`app/_stack`). 웹 서버는 앱 경로(`/assets/...`)에 이 index.html 을 주고, 번들 앱은
 * 앱 셸이 이 파일을 연다 (`lib/native/bundled-app.ts`).
 */
function App() {
  useSeedColorScheme();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SystemBackButton />
      <UpdateGate>
        <HydrationGate>
          {/* 앱이 여기까지 떠야 OTA 번들이 정상으로 떴다고 알린다 (못 알리면 자동 롤백). */}
          <LiveUpdateRunner />
          <AuthGate>
            <Suspense fallback={null}>
              <MobileStack />
            </Suspense>
            {/* 로그인 직후 한 번, 생체 인증 로그인을 켤지 묻는다 (네이티브 앱). */}
            <BiometricLoginOffer />
          </AuthGate>
        </HydrationGate>
      </UpdateGate>
    </ThemeProvider>
  );
}

const bundled = isBundledApp();
// 번들 앱은 웹 서버의 경로 정리(apps/web/proxy.ts)를 거치지 않는다 — 스택이 주소를 읽기 전에 맞춘다.
if (bundled) {
  const pathname = bundledAppPath(window.location.pathname);
  if (pathname !== window.location.pathname) {
    window.history.replaceState(null, "", `${pathname}${window.location.search}`);
  }
}

const container = document.getElementById("root");
if (!container) throw new Error("#root 가 없다 (index.html)");
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 서비스 워커는 웹 서버가 주는 화면(모바일 웹)에만 — 번들 앱은 화면을 이미 기기에 갖고 있다.
if (!bundled) registerServiceWorker();
