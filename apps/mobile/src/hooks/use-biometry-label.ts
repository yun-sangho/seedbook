"use client";

import { useEffect, useState } from "react";
import { availableBiometryLabel, type BiometryName } from "@mobile/lib/native/biometric";

/** 이 기기에서 쓸 수 있는 생체 인증 이름. 브라우저·미지원 기기면 null. */
export function useBiometryLabel(): BiometryName | null {
  const [label, setLabel] = useState<BiometryName | null>(null);
  useEffect(() => {
    let cancelled = false;
    availableBiometryLabel().then((value) => {
      if (!cancelled) setLabel(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return label;
}
