"use client";

/**
 * 네이티브 앱(Capacitor) 생체 인증 래퍼. Capacitor 는 server.url 로 띄운 원격 페이지에도
 * 네이티브 브리지를 주입하므로 웹 번들에서 플러그인을 바로 부른다. 브라우저·SSR 에서는
 * 브리지가 없어 모든 함수가 "쓸 수 없음" 으로 끝난다. 플러그인은 필요할 때만 불러온다.
 */

async function nativeBiometric() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
  return NativeBiometric;
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
    const plugin = await nativeBiometric();
    if (!plugin) return null;
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
    const plugin = await nativeBiometric();
    if (!plugin) return false;
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
