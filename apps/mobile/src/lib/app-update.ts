import { type AppConfig, isAppVersionBlocked, parseAppConfig } from "@seedbook/domain/app-version";
import { apiFetch } from "./api-client";
import { isBundledApp } from "./native/bundled-app";

/**
 * 앱 강제 업데이트 (`GET /api/app-config`, 서버 `apps/web/lib/app-config.ts`). 번들 앱만 본다 — 브라우저와
 * 옛 앱 셸은 화면을 서버에서 받으므로 늘 최신이다.
 */

/** 이 번들의 버전 (`package.json` `version`, vite.config.ts 가 빌드 때 넣는다). 테스트·dev 는 빈 문자열. */
export const APP_VERSION = process.env.SEEDBOOK_APP_VERSION ?? "";

/** 스토어 주소. App Store 는 출시 전이라 앱 ID 가 없다 — 정해지면 넣는다. */
export const APP_STORE_URLS: Record<"ios" | "android", string | null> = {
  ios: null,
  android: "https://play.google.com/store/apps/details?id=ing.boogie.seedbook",
};

/** 업데이트 확인을 기다리는 최대 시간. 확인하지 못하면 막지 않는다. */
const CHECK_TIMEOUT_MS = 10_000;

/** 서버의 버전 정책. 오프라인·서버 오류·모양이 틀린 응답이면 null (앱을 막지 않는다). */
export async function fetchAppConfig(
  fetchImpl: typeof fetch = apiFetch
): Promise<AppConfig | null> {
  try {
    const response = await fetchImpl("/api/app-config", {
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return parseAppConfig(await response.json());
  } catch {
    return null;
  }
}

/** 이 앱이 업데이트해야만 쓸 수 있는지. 번들 앱이 아니면 늘 false. */
export async function checkUpdateRequired(
  deps: {
    bundled?: boolean;
    appVersion?: string;
    fetchConfig?: () => Promise<AppConfig | null>;
  } = {}
): Promise<boolean> {
  const { bundled = isBundledApp(), appVersion = APP_VERSION, fetchConfig = fetchAppConfig } = deps;
  if (!bundled) return false;
  return isAppVersionBlocked(appVersion, await fetchConfig());
}

/** 이 기기의 스토어 주소. 모르면 null. */
export function storeUrlFor(userAgent: string): string | null {
  return /android/i.test(userAgent) ? APP_STORE_URLS.android : APP_STORE_URLS.ios;
}
