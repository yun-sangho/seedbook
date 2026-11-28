"use client";

import { apiFetch } from "@mobile/lib/api-client";
import { getDeviceStorage } from "@mobile/lib/device-storage";
import { createBiometricVault } from "./biometric";
import type { BiometricLoginDeps } from "./biometric-login";

/** 실제 금고·서버·기기 저장소로 묶은 생체 인증 로그인 의존성. 네이티브 앱이 아니면 null. */
export async function getBiometricLoginDeps(): Promise<BiometricLoginDeps | null> {
  const vault = await createBiometricVault();
  if (!vault) return null;
  return {
    vault,
    storage: getDeviceStorage(),
    request: async (path, body) => {
      const response = await apiFetch(`/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const json: unknown = await response.json().catch(() => null);
      return { status: response.status, body: json };
    },
  };
}
