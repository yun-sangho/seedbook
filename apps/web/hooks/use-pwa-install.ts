"use client";

import { useCallback, useEffect, useState } from "react";
import { isIOSUserAgent, resolveInstallMode, type InstallMode } from "@web/lib/pwa-install";

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

/**
 * 홈 화면 설치 상태와 설치 실행 함수.
 * `beforeinstallprompt` 는 페이지 로드 직후 한 번 오므로 항상 마운트된 곳(모바일 셸)에서 호출한다.
 */
export function usePwaInstall(): { mode: InstallMode; install: () => Promise<void> } {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setIsIOS(isIOSUserAgent(navigator.userAgent));

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
    mode: resolveInstallMode({ isStandalone: standalone, isIOS, hasPrompt: promptEvent !== null }),
    install,
  };
}
