"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { isNativeAppUserAgent } from "@web/lib/device";
import { type InstallMode, isIOSUserAgent, resolveInstallMode } from "@web/lib/pwa-install";

/** Chromium 전용 이벤트라 lib.dom 에 타입이 없다. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari 의 홈 화면 앱
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export interface PwaInstall {
  mode: InstallMode;
  install: () => Promise<void>;
  isIOS: boolean;
  isNativeApp: boolean;
}

/**
 * 홈 화면 설치 상태와 설치 실행 함수.
 * `beforeinstallprompt` 는 페이지 로드 직후 한 번 오므로 항상 마운트된 곳(모바일 셸)에서 호출한다.
 */
export function usePwaInstall(): PwaInstall {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isNativeApp, setIsNativeApp] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setIsIOS(isIOSUserAgent(navigator.userAgent, navigator.maxTouchPoints));
    setIsNativeApp(isNativeAppUserAgent(navigator.userAgent));

    const onPrompt = (event: Event) => {
      // 브라우저 기본 미니 인포바 대신 우리 버튼에서 띄운다.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    // 프롬프트는 한 번만 쓸 수 있다.
    setPromptEvent(null);
  }, [promptEvent]);

  return {
    mode: resolveInstallMode({
      isStandalone: standalone,
      isIOS,
      hasPrompt: promptEvent !== null,
      isNativeApp,
    }),
    install,
    isIOS,
    isNativeApp,
  };
}

/** 모바일 셸(`mobile-stack-client.tsx`)이 받은 설치 상태를 화면(설정 메뉴)에 내려준다. */
export const PwaInstallContext = createContext<PwaInstall>({
  mode: "unavailable",
  install: async () => {},
  isIOS: false,
  isNativeApp: false,
});

export function usePwaInstallState(): PwaInstall {
  return useContext(PwaInstallContext);
}
