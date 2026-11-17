"use client";

import { type BiometricVault, classifyBiometricError } from "./biometric-login";

/**
 * 네이티브 앱(Capacitor) 생체 인증 래퍼. Capacitor 는 server.url 로 띄운 원격 페이지에도
 * 네이티브 브리지를 주입하므로 웹 번들에서 플러그인을 바로 부른다. 브라우저·SSR 에서는
 * 브리지가 없어 모든 함수가 "쓸 수 없음" 으로 끝난다. 플러그인은 필요할 때만 불러온다.
 */

async function nativeBiometric() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
  // 플러그인 Proxy 는 `.then` 도 네이티브 호출로 바꾼다 — 그대로 돌려주면 await 가 멈춘다.
  // 객체로 감싸 thenable 로 취급되지 않게 한다.
  return { plugin: NativeBiometric };
}

export type BiometryName = "Face ID" | "Touch ID" | "지문" | "생체 인증";

/** 문구용 "~(으)로" — 받침이 있는 이름에는 "으로". */
export const BIOMETRY_WITH_RO: Record<BiometryName, string> = {
  "Face ID": "Face ID로",
  "Touch ID": "Touch ID로",
  지문: "지문으로",
  "생체 인증": "생체 인증으로",
};

/** 쓸 수 있는 생체 인증 이름 (설정 문구용). 없으면 null. */
export async function availableBiometryLabel(): Promise<BiometryName | null> {
  try {
    const native = await nativeBiometric();
    if (!native) return null;
    const { plugin } = native;
    const { BiometryType } = await import("@capgo/capacitor-native-biometric");
    const result = await plugin.isAvailable({ useFallback: true });
    if (!result.isAvailable) return null;
    if (result.biometryType === BiometryType.FACE_ID) return "Face ID";
    if (result.biometryType === BiometryType.TOUCH_ID) return "Touch ID";
    if (result.biometryType === BiometryType.FINGERPRINT) return "지문";
    return "생체 인증";
  } catch {
    return null;
  }
}

/** 생체 인증(실패 시 기기 암호) 을 요청한다. 통과하면 true. */
export async function verifyBiometric(reason: string): Promise<boolean> {
  try {
    const native = await nativeBiometric();
    if (!native) return false;
    const { plugin } = native;
    await plugin.verifyIdentity({
      reason,
      title: "Seedbook 잠금 해제",
      negativeButtonText: "취소",
      useFallback: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 생체 인증 로그인 토큰을 담는 Keychain (iOS) / Keystore (Android) 금고. 네이티브 앱이 아니면 null.
 * `BIOMETRY_CURRENT_SET`: 하드웨어가 꺼낼 때마다 생체 인증을 강제하고, 지문·얼굴이 새로 등록되면
 * 항목이 무효가 된다 (남이 자기 지문을 추가해 로그인하는 것을 막는다). 흐름은 `biometric-login.ts`.
 */
export async function createBiometricVault(): Promise<BiometricVault | null> {
  const native = await nativeBiometric();
  if (!native) return null;
  const { plugin } = native;
  const { Capacitor } = await import("@capacitor/core");
  const { AccessControl } = await import("@capgo/capacitor-native-biometric");
  // 자격 증명의 키. 운영·로컬 서버의 토큰이 섞이지 않게 접속한 호스트로 나눈다.
  const server = window.location.host;
  // Android 플러그인은 기본으로 한 번만 틀려도 끝낸다 — 시스템 기본처럼 몇 번 다시 대 볼 수 있게.
  // (iOS 는 OS 가 시도 횟수를 관리해 무시된다.)
  const maxAttempts = 5;

  return {
    platform: Capacitor.getPlatform() === "android" ? "android" : "ios",
    verify: (reason) => verifyBiometric(reason),
    save: async ({ credentialId, token }) => {
      try {
        await plugin.setCredentials({
          server,
          username: credentialId,
          password: token,
          accessControl: AccessControl.BIOMETRY_CURRENT_SET,
          title: "생체 인증 로그인 켜기",
          negativeButtonText: "취소",
          maxAttempts,
        });
        return true;
      } catch {
        return false;
      }
    },
    read: async (reason) => {
      try {
        const credential = await plugin.getSecureCredentials({
          server,
          reason,
          title: "Seedbook 로그인",
          negativeButtonText: "취소",
          maxAttempts,
        });
        return { ok: true, credentialId: credential.username, token: credential.password };
      } catch (error) {
        return { ok: false, failure: classifyBiometricError(error) };
      }
    },
    exists: async () => (await plugin.isCredentialsSaved({ server })).isSaved,
    remove: async () => {
      try {
        await plugin.deleteCredentials({ server });
      } catch {
        // 지울 항목이 없으면 거절한다 — 이미 지워진 것과 같다.
      }
    },
  };
}
