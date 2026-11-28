"use client";

import { useEffect, useState } from "react";
import { authClient } from "@mobile/lib/auth-client";
import { type SocialProvider, signInCallbackURL } from "@mobile/lib/last-login-method";
import { noteSignedInForAppLock } from "@mobile/lib/native/app-lock";
import { nativeSessionToken } from "@mobile/lib/native/session-token";
import { hasNativeLoginPlugin, signInNatively } from "@mobile/lib/native/social-login";

/**
 * 소셜 로그인 시작. 취소·실패하면 같은 경로로 돌아와 로그인 화면이 안내한다 (`lib/login-flow.ts`).
 * 성공하면 브라우저가 제공자 화면으로 떠나므로 진행 상태를 유지하고, 시작하지 못했을 때만 푼다.
 * 로그인에 성공해 돌아온 주소에는 수단이 붙는다 — `AuthGate` 가 이 기기의 최근 수단으로 남긴다
 * (`lib/last-login-method.ts`).
 *
 * 네이티브 앱은 카카오 SDK·Sign in with Apple 로 받은 ID 토큰으로 로그인한다 (`lib/native/social-login.ts`).
 * 그 응답이 세션 토큰을 주고 (`set-auth-token`), 웹 흐름과 같은 돌아올 주소로 다시 연다. 이 기기에서
 * 네이티브 로그인을 쓸 수 없으면 웹 OAuth 로 간다.
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
      // 만료된 세션의 토큰이 남아 있으면 새 로그인의 쿠키 세션을 가린다 — 로그인 전에 비운다.
      if (nativeSessionToken.enabled()) await nativeSessionToken.clear();
      const native = hasNativeLoginPlugin(provider) ? await signInNatively(provider) : null;
      if (native?.status === "cancelled") {
        setPendingProvider(null);
        return;
      }
      if (native?.status === "ok") {
        const { error } = await authClient.signIn.social({ provider, idToken: native.idToken });
        if (!error) {
          noteSignedInForAppLock();
          window.location.replace(signInCallbackURL(returnPath, provider));
          return;
        }
      }
      if (native) throw new Error("native sign-in failed");

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
