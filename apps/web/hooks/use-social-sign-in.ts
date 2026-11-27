"use client";

import { useEffect, useState } from "react";
import { authClient } from "@web/lib/auth-client";
import { type SocialProvider, signInCallbackURL } from "@web/lib/last-login-method";

/**
 * 소셜 로그인 시작. 취소·실패하면 같은 경로로 돌아와 로그인 화면이 안내한다 (`lib/login-flow.ts`).
 * 성공하면 브라우저가 제공자 화면으로 떠나므로 진행 상태를 유지하고, 시작하지 못했을 때만 푼다.
 * 로그인에 성공해 돌아온 주소에는 수단이 붙는다 — `AuthGate` 가 이 기기의 최근 수단으로 남긴다
 * (`lib/last-login-method.ts`).
 */
export function useSocialSignIn(returnPath: string) {
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(null);
  const [failed, setFailed] = useState(false);

  // 제공자 화면에서 뒤로가기로 돌아오면 (bfcache) 떠날 때의 진행 상태가 남아 있다.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPendingProvider(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const signIn = async (provider: SocialProvider) => {
    setPendingProvider(provider);
    setFailed(false);
    try {
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: signInCallbackURL(returnPath, provider),
        errorCallbackURL: returnPath,
      });
      if (!error) return;
    } catch {
      // 네트워크 오류 — 아래에서 실패로 알린다.
    }
    setPendingProvider(null);
    setFailed(true);
  };

  return { pendingProvider, failed, signIn };
}
