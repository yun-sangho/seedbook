import "./globals.css";
import "@seed-design/css/base.css";
import { StrictMode, Suspense } from "react";
import { MobileStack } from "@mobile/app/_stack/mobile-stack";
import { AuthGate } from "@mobile/components/auth-gate";
import { HydrationGate } from "@mobile/components/hydration-gate";
import { BiometricLoginOffer } from "@mobile/components/mobile/biometric-login";
import { useSeedColorScheme } from "@mobile/components/mobile/seed-color-scheme";
import { SystemBackButton } from "@mobile/components/mobile/system-back-button";
import { ThemeProvider } from "@mobile/components/theme-provider";
import { registerServiceWorker } from "@mobile/lib/service-worker";
import { createRoot } from "react-dom/client";

/**
 * 앱 화면의 시작점 (옛 Next `app/layout.tsx` + `app/m/layout.tsx`). 화면은 Stackflow 스택이
 * URL 을 보고 그린다 (`app/_stack`). 웹 서버는 앱 경로(`/assets/...`)에 이 index.html 을 준다.
 */
function App() {
  useSeedColorScheme();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SystemBackButton />
      <HydrationGate>
        <AuthGate>
          <Suspense fallback={null}>
            <MobileStack />
          </Suspense>
          {/* 로그인 직후 한 번, 생체 인증 로그인을 켤지 묻는다 (네이티브 앱). */}
          <BiometricLoginOffer />
        </AuthGate>
      </HydrationGate>
    </ThemeProvider>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("#root 가 없다 (index.html)");
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerServiceWorker();
