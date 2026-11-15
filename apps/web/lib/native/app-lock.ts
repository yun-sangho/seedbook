/**
 * 네이티브 앱 잠금 (Face ID / 지문). 앱을 다시 열 때 생체 인증을 요구한다.
 *
 * 설정은 기기 단위라 서버 동기화 없이 이 WebView 의 localStorage 에만 둔다.
 * 잠깐 다른 앱에 다녀오는 경우(증권 앱에서 수량 확인 등)는 매번 잠그면 번거로우므로
 * 백그라운드에 `APP_LOCK_GRACE_MS` 이상 있었을 때만 잠근다. 앱을 새로 띄우면 항상 잠긴다.
 */

export const APP_LOCK_STORAGE_KEY = "seedbook.app-lock";
export const APP_LOCK_GRACE_MS = 60_000;

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isAppLockEnabled(storage: KeyValueStorage): boolean {
  try {
    return storage.getItem(APP_LOCK_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setAppLockEnabled(storage: KeyValueStorage, enabled: boolean): void {
  if (enabled) storage.setItem(APP_LOCK_STORAGE_KEY, "on");
  else storage.removeItem(APP_LOCK_STORAGE_KEY);
}

export function shouldLockOnReturn(input: {
  enabled: boolean;
  hiddenAt: number | null;
  now: number;
}): boolean {
  if (!input.enabled || input.hiddenAt === null) return false;
  return input.now - input.hiddenAt >= APP_LOCK_GRACE_MS;
}
