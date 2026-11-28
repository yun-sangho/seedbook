"use client";

import { useEffect, useState } from "react";
import type { BiometricLoginDeps } from "@mobile/lib/native/biometric-login";
import { getBiometricLoginDeps } from "@mobile/lib/native/biometric-login-client";

/** 생체 인증 로그인 의존성 (네이티브 앱에서만). 브라우저면 계속 null. */
export function useBiometricLoginDeps(): BiometricLoginDeps | null {
  const [deps, setDeps] = useState<BiometricLoginDeps | null>(null);
  useEffect(() => {
    let cancelled = false;
    getBiometricLoginDeps().then((value) => {
      if (!cancelled) setDeps(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return deps;
}
