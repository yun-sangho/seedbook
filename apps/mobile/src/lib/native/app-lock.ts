/**
 * 네이티브 앱 잠금 (Face ID / 지문). 앱을 다시 열 때 생체 인증을 요구한다.
 *
 * 설정은 기기 단위라 서버 동기화 없이 기기 저장소에만 둔다.
 * 잠깐 다른 앱에 다녀오는 경우(증권 앱에서 수량 확인, 카카오톡·공유 시트 등)는 매번 잠그면
 * 번거로우므로 백그라운드에 `APP_LOCK_GRACE_MS` 이상 있었을 때만 잠근다.
 *
 * 페이지가 다시 로드될 때(로그인 직후, `reloadApp()` — 저장 방식 전환·동의·계정 전환, iOS 가 WebView 를
 * 다시 띄울 때)는 새로 띄운 앱과 구분해야 한다. 잠금이 풀린 화면이 마지막으로 보였던 시각을
 * sessionStorage 에 남겨(`recordAppLockSeen`) 그 시각부터 유예 시간 안이면 다시 잠그지 않는다.
 * sessionStorage 는 앱을 완전히 끄면 사라지므로 앱을 새로 띄우면 항상 잠긴다.
 */

export const APP_LOCK_STORAGE_KEY = "seedbook.app-lock";
/** 사용자 결정 (2026-11-28): 5분. */
export const APP_LOCK_GRACE_MS = 5 * 60_000;
export const APP_LOCK_SEEN_STORAGE_KEY = "seedbook.app-lock.seen-at";

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

/** 페이지를 새로 그릴 때(로드·새로고침) 잠글지. 잠금이 풀린 화면이 유예 시간 안에 보였으면 잠그지 않는다. */
export function shouldLockOnLaunch(input: {
  enabled: boolean;
  lastSeenAt: number | null;
  now: number;
}): boolean {
  if (!input.enabled) return false;
  if (input.lastSeenAt === null || input.now < input.lastSeenAt) return true;
  return input.now - input.lastSeenAt >= APP_LOCK_GRACE_MS;
}

/** 잠금이 풀린 화면이 `now` 에 보였다 (숨겨질 때·페이지를 떠날 때·잠금 해제·로그인 직후). */
export function recordAppLockSeen(storage: KeyValueStorage | null, now: number): void {
  try {
    storage?.setItem(APP_LOCK_SEEN_STORAGE_KEY, String(now));
  } catch {
    // 남기지 못하면 다음 로드에서 한 번 더 잠길 뿐이다.
  }
}

/** 잠긴 동안에는 지운다 — 잠금 화면에서 페이지가 다시 로드돼도 잠긴 채로 둔다. */
export function clearAppLockSeen(storage: KeyValueStorage | null): void {
  try {
    storage?.removeItem(APP_LOCK_SEEN_STORAGE_KEY);
  } catch {
    // 지우지 못해도 유예 시간이 지나면 다시 잠긴다.
  }
}

export function readAppLockSeen(storage: KeyValueStorage | null): number | null {
  try {
    const raw = storage?.getItem(APP_LOCK_SEEN_STORAGE_KEY) ?? null;
    if (raw === null || !/^\d+$/.test(raw)) return null;
    return Number(raw);
  } catch {
    return null;
  }
}

/** 앱을 끄면 사라지는 이 WebView 의 sessionStorage. 쓸 수 없으면 null. */
export function appSessionStorage(): KeyValueStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** 방금 로그인했다 — 로그인 뒤 페이지를 다시 열 때 앱 잠금이 생체 인증을 또 묻지 않게 한다. */
export function noteSignedInForAppLock(): void {
  recordAppLockSeen(appSessionStorage(), Date.now());
}
