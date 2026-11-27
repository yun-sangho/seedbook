"use client";

import { useEffect, useState } from "react";
import { Icon } from "@seed-design/react";
import { AppleSignInActionButton } from "@web/components/apple-sign-in-action-button";
import { BiometricSignInButton } from "@web/components/biometric-sign-in-button";
import { useSocialSignIn } from "@web/hooks/use-social-sign-in";
import { getDeviceStorage } from "@web/lib/device-storage";
import {
  lastLoginMethodLabel,
  readLastLoginMethod,
  type SocialProvider,
} from "@web/lib/last-login-method";
import { LEGAL_DOCUMENTS } from "@web/lib/legal-documents";
import {
  LOGIN_ERROR_PARAM,
  LOGIN_FAILED_MESSAGE,
  loginErrorMessage,
  resolveReturnPath,
} from "@web/lib/login-flow";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Callout } from "@web/seed-design/ui/callout";
import { Sprout } from "lucide-react";

// Next.js 가 빌드 타임에 치환하므로 클라이언트 번들에서도 사용 가능.
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
  const [returnPath] = useState(() => resolveReturnPath(window.location.pathname));
  const [callbackError] = useState(() =>
    loginErrorMessage(new URLSearchParams(window.location.search).get(LOGIN_ERROR_PARAM))
  );
  const { pendingProvider, failed, signIn } = useSocialSignIn(returnPath);
  // 다른 수단으로 따로 가입해 계정이 둘로 갈리지 않게, 이 기기에서 쓰던 수단을 알려 준다.
  const [lastLoginMethod] = useState(() => readLastLoginMethod(getDeviceStorage()));
  const [devPending, setDevPending] = useState(false);
  const [devFailed, setDevFailed] = useState(false);

  // 새로고침해도 지난 오류가 다시 나오지 않게 주소에서 지운다. state 를 그대로 넘겨 Next 라우터
  // 상태를 유지한다 (`app/m/_stack/next-aware-history.ts`).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has(LOGIN_ERROR_PARAM)) return;
    window.history.replaceState(window.history.state, "", returnPath);
  }, [returnPath]);

  const signInWithDevBypass = async () => {
    setDevPending(true);
    setDevFailed(false);
    const response = await fetch("/api/auth/dev-login", { method: "POST" }).catch(() => null);
    if (response?.ok) {
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
    <main className="bg-bg-layer-default text-fg-neutral flex h-dvh w-full flex-col overflow-y-auto px-x6 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <div className="mx-auto my-auto flex w-full max-w-sm flex-col gap-x8 py-x8">
        <div className="flex flex-col items-center gap-x3 text-center">
          <Icon svg={<Sprout aria-hidden />} size="x10" />
          <h1 className="t8-bold">Seedbook 로그인</h1>
          <p className="t5-regular text-fg-neutral-muted break-keep">
            투자 계좌와 목표 비중, 리밸런싱을
            <br />
            한곳에서 관리해요
          </p>
        </div>

        <div className="flex flex-col gap-x2">
          {message && (
            <div role="alert" className="pb-x2">
              <Callout tone="neutral" description={message} />
            </div>
          )}
          {/* 네이티브 앱에서 생체 인증 로그인을 켜 둔 기기에서만 보인다. */}
          <BiometricSignInButton callbackURL={returnPath} />
          <ActionButton
            variant="neutralSolid"
            size="large"
            loading={pendingProvider === "kakao"}
            disabled={busy && pendingProvider !== "kakao"}
            onClick={() => signIn("kakao")}
          >
            카카오로 로그인
          </ActionButton>
          {lastLoginMethod === "kakao" && <LastLoginHint provider="kakao" />}
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
          <p className="t3-regular text-fg-neutral-subtle pt-x2 text-center break-keep">
            로그인할 때 이름·이메일·프로필 사진은 받지 않아요.
            <br />
            로그인을 확인하는 번호만 저장해요.
          </p>
        </div>
      </div>

      <div className="t3-regular text-fg-neutral-subtle flex justify-center gap-x4">
        {LEGAL_DOCUMENTS.map(({ id, title, href }) => (
          <a key={id} href={href} className="underline underline-offset-4">
            {title}
          </a>
        ))}
      </div>
    </main>
  );
}
