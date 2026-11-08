import type { StorageMode } from "@web/lib/storage-mode";

/**
 * PWA 설치 방법 판단.
 *
 * - `installed`: 이미 홈 화면 앱(standalone)으로 실행 중
 * - `prompt`: 브라우저가 `beforeinstallprompt` 를 줬다 (Android Chrome 등) — 버튼으로 설치
 * - `ios-manual`: iOS Safari 는 설치 API 가 없어 "공유 → 홈 화면에 추가" 안내
 * - `unavailable`: 설치 수단 없음 (이미 설치됐거나 지원 안 하는 브라우저)
 */
export type InstallMode = "installed" | "prompt" | "ios-manual" | "unavailable";

export function isIOSUserAgent(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

export function resolveInstallMode(input: {
  isStandalone: boolean;
  isIOS: boolean;
  hasPrompt: boolean;
}): InstallMode {
  if (input.isStandalone) return "installed";
  if (input.hasPrompt) return "prompt";
  if (input.isIOS) return "ios-manual";
  return "unavailable";
}

/**
 * iOS 홈 화면 앱은 Safari 와 localStorage·쿠키가 분리된 별도 저장공간을 쓴다.
 * "이 기기에만 저장"(local) 모드라면 Safari 에서 쓰던 데이터가 홈 화면 앱에서
 * 보이지 않으므로(반대도 마찬가지) 클라우드 저장을 안내해야 한다.
 * Android 설치 앱은 Chrome 과 저장공간을 공유해 해당 없음.
 */
export function needsSeparateStorageNotice(input: {
  isIOS: boolean;
  storageMode: StorageMode;
}): boolean {
  return input.isIOS && input.storageMode === "local";
}
