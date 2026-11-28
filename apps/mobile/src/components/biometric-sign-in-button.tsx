"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBiometricLoginDeps } from "@mobile/hooks/use-biometric-login-deps";
import { useBiometryLabel } from "@mobile/hooks/use-biometry-label";
import { BIOMETRY_WITH_RO, type BiometryName } from "@mobile/lib/native/biometric";
import {
  isSignedOutMarked,
  readBiometricLoginEnrollment,
  type SignInResult,
  signInWithBiometricLogin,
} from "@mobile/lib/native/biometric-login";
import { ActionButton } from "@mobile/seed-design/ui/action-button";

function failureMessage(result: SignInResult, label: BiometryName): string | null {
  switch (result) {
    case "invalidated":
      return "생체 정보가 바뀌었거나 오래 쓰지 않아 생체 인증 로그인이 해제됐어요. 로그인한 뒤 다시 켜 주세요.";
    case "unavailable":
      return `지금은 ${label}을 쓸 수 없어요. 다른 방법으로 로그인해 주세요.`;
    case "failed":
      return "로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
    default:
      return null;
  }
}

export function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * 로그인 화면의 "Face ID(지문)로 로그인" 버튼. 네이티브 앱에서 이 기기에 생체 인증 로그인을 켜
 * 두었을 때만 보인다. 앱을 열면 프롬프트를 한 번 자동으로 띄운다 — 방금 직접 로그아웃했으면 제외.
 */
export function BiometricSignInButton({ callbackURL }: { callbackURL: string }) {
  const deps = useBiometricLoginDeps();
  const biometryLabel = useBiometryLabel();
  const [enrolled, setEnrolled] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const autoPromptedRef = useRef(false);

  useEffect(() => {
    if (deps) setEnrolled(readBiometricLoginEnrollment(deps.storage) !== null);
  }, [deps]);

  const signIn = useCallback(async () => {
    if (!deps || !biometryLabel) return;
    setPending(true);
    setMessage(null);
    const result = await signInWithBiometricLogin(deps);
    if (result === "signed-in") {
      window.location.href = callbackURL;
      return;
    }
    setPending(false);
    if (result === "invalidated") setEnrolled(false);
    setMessage(failureMessage(result, biometryLabel));
  }, [deps, biometryLabel, callbackURL]);

  useEffect(() => {
    if (!enrolled || !biometryLabel || autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    const session = sessionStorageOrNull();
    if (session && isSignedOutMarked(session)) return;
    void signIn();
  }, [enrolled, biometryLabel, signIn]);

  if (!biometryLabel) return null;
  return (
    <>
      {enrolled && (
        <ActionButton variant="neutralSolid" size="large" onClick={signIn} loading={pending}>
          {BIOMETRY_WITH_RO[biometryLabel]} 로그인
        </ActionButton>
      )}
      {message && (
        <p role="alert" className="t4-regular text-fg-neutral-muted text-center break-keep">
          {message}
        </p>
      )}
    </>
  );
}
