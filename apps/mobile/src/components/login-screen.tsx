"use client";

import { useEffect, useState } from "react";
import { AppleSignInActionButton } from "@mobile/components/apple-sign-in-action-button";
import { BiometricSignInButton } from "@mobile/components/biometric-sign-in-button";
import { BrandMark } from "@mobile/components/brand-mark";
import { KakaoSignInButton } from "@mobile/components/kakao-sign-in-button";
import { useSocialSignIn } from "@mobile/hooks/use-social-sign-in";
import { apiFetch } from "@mobile/lib/api-client";
import { getDeviceStorage } from "@mobile/lib/device-storage";
import {
  lastLoginMethodLabel,
  readLastLoginMethod,
  type SocialProvider,
} from "@mobile/lib/last-login-method";
import { LEGAL_DOCUMENTS } from "@mobile/lib/legal-documents";
import {
  LOGIN_ERROR_PARAM,
  LOGIN_FAILED_MESSAGE,
  loginErrorMessage,
  resolveReturnPath,
} from "@mobile/lib/login-flow";
import { noteSignedInForAppLock } from "@mobile/lib/native/app-lock";
import { canSignInWith } from "@mobile/lib/native/social-login";
import { useHideSplash } from "@mobile/lib/native/splash";
import { pendingSignOut } from "@mobile/lib/pending-sign-out";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import { Callout } from "@mobile/seed-design/ui/callout";

// 앱 번들 빌드(vite.config.ts `define`)가 치환한다.
const isDevEnv = process.env.NODE_ENV === "development";

/** 이 기기에서 마지막으로 쓴 수단의 버튼 아래에 붙는다 (`lib/last-login-method.ts`). */
function LastLoginHint({ provider }: { provider: SocialProvider }) {
  return (
    <p className="t3-medium text-fg-brand -mt-x1 pb-x1 text-center">
      {lastLoginMethodLabel(provider)}
    </p>
  );
}

/**
 * 로그인 화면. 브라우저에서만 그려진다 (`HydrationGate` 아래) — 첫 렌더에서 주소를 읽어도 된다.
 */
export function LoginScreen() {
  useHideSplash();
  const [returnPath] = useState(() => resolveReturnPath(window.location.pathname));
  const [callbackError] = useState(() =>
    loginErrorMessage(new URLSearchParams(window.location.search).get(LOGIN_ERROR_PARAM))
  );
  const { pendingProvider, failed, signIn } = useSocialSignIn(returnPath);
  // 다른 수단으로 따로 가입해 계정이 둘로 갈리지 않게, 이 기기에서 쓰던 수단을 알려 준다.
  const [lastLoginMethod] = useState(() => readLastLoginMethod(getDeviceStorage()));
  const [devPending, setDevPending] = useState(false);
  const [devFailed, setDevFailed] = useState(false);

  // 새로고침해도 지난 오류가 다시 나오지 않게 주소에서 지운다. history state 는
  // 그대로 둔다 (`app/_stack/address-bar-history.ts`).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has(LOGIN_ERROR_PARAM)) return;
    window.history.replaceState(window.history.state, "", returnPath);
  }, [returnPath]);

  const signInWithDevBypass = async () => {
    setDevPending(true);
    setDevFailed(false);
    void pendingSignOut.clear().catch(() => undefined);
    const response = await apiFetch("/api/auth/dev-login", { method: "POST" }).catch(() => null);
    if (response?.ok) {
      noteSignedInForAppLock();
      window.location.href = returnPath;
      return;
    }
    setDevPending(false);
    setDevFailed(true);
  };

  const busy = pendingProvider !== null || devPending;
  // 다시 시도하면 지난 왕복의 오류는 지운다.
  const message = failed || devFailed ? LOGIN_FAILED_MESSAGE : busy ? null : callbackError;

  return (
    <main className="bg-bg-layer-default text-fg-neutral flex h-dvh w-full flex-col overflow-y-auto px-x6 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+20px)]">
      {/* 스플래시와 같은 마크·같은 자리 — 스플래시가 걷히면 마크는 그대로 있고 버튼이 아래에 나타난다. */}
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-x3 py-x8 text-center">
        {/* 그림 폭 ~110pt — 스플래시 마크와 같은 크기 (scripts/brand-icons-lib.mjs SPLASH_MARK_BOX). */}
        <BrandMark size={180} />
        {/* 화면에는 이름만, 스크린리더는 무슨 화면인지 함께 읽는다. */}
        <h1 className="t9-bold" aria-label="Seedbook 로그인">
          Seedbook
        </h1>
        <p className="t5-regular text-fg-neutral-muted break-keep">
          내가 정한 목표를 내 기준대로
          <br />
          이뤄 갈수록 식물이 자라요
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-col gap-x2">
        {message && (
          <div role="alert" className="pb-x2">
            <Callout tone="neutral" description={message} />
          </div>
        )}
        {/* 네이티브 앱에서 생체 인증 로그인을 켜 둔 기기에서만 보인다. */}
        <BiometricSignInButton callbackURL={returnPath} />
        {canSignInWith("kakao") && (
          <>
            <KakaoSignInButton
              size="large"
              loading={pendingProvider === "kakao"}
              disabled={busy && pendingProvider !== "kakao"}
              onClick={() => signIn("kakao")}
            />
            {lastLoginMethod === "kakao" && <LastLoginHint provider="kakao" />}
          </>
        )}
        <AppleSignInActionButton
          size="large"
          hint={lastLoginMethod === "apple" && <LastLoginHint provider="apple" />}
          loading={pendingProvider === "apple"}
          disabled={busy && pendingProvider !== "apple"}
          onClick={() => signIn("apple")}
        />
        {isDevEnv && (
          <ActionButton
            variant="neutralOutline"
            size="large"
            loading={devPending}
            disabled={busy && !devPending}
            onClick={signInWithDevBypass}
          >
            개발용 빠른 로그인 (카카오 우회)
          </ActionButton>
        )}
        {/* 로그인에서 신상 정보를 받지 않는다 (`lib/auth-privacy.ts`). */}
        <p className="t3-regular text-fg-neutral-subtle pt-x3 text-center break-keep">
          이름·이메일·프로필 사진은 받지 않아요.
          <br />
          로그인을 확인하는 번호만 저장해요.
        </p>
        <div className="t3-regular text-fg-neutral-subtle flex justify-center gap-x4 pt-x1">
          {LEGAL_DOCUMENTS.map(({ id, title, href }) => (
            <a key={id} href={href} className="underline underline-offset-4">
              {title}
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
