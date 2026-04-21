/**
 * 사용자 선택 저장소 모드의 동기(sync) 접근자.
 *
 * 이 모듈은 의도적으로 Zustand persist 를 사용하지 않는다. 6 개의 자산 store
 * 들이 자기 자신의 hydration 이 시작될 때 "어느 backend 로부터 읽어야 하는가"
 * 를 알아야 하는데, 그 시점에 또 다른 persist store 가 하이드레이션 중이면
 * chicken-and-egg 가 되기 때문이다. 따라서 localStorage 에 직접 키 하나만
 * 쓰고 읽는다.
 */

export const STORAGE_MODE_KEY = "seedbook.storageMode";

export type StorageMode = "local" | "cloud";

/**
 * Zustand persist 에 배선된 store 들의 key. 이 배열은 **closed set** 이며
 * API 라우트가 임의의 key 요청을 거부하는 화이트리스트이기도 하다.
 */
export const CLOUD_STORE_KEYS = [
  "investment-storage",
  "savings-storage",
  "asset-plan-storage",
  "real-assets-storage",
  "debts-storage",
  "progress-storage",
  "portfolio-storage",
] as const;

export type CloudStoreKey = (typeof CLOUD_STORE_KEYS)[number];

export function isCloudStoreKey(value: string): value is CloudStoreKey {
  return (CLOUD_STORE_KEYS as readonly string[]).includes(value);
}

/**
 * 현재 저장소 모드를 반환한다. SSR / 값 없음 / 잘못된 값은 모두 `local` 로
 * 폴백한다 (기존 동작과 동일).
 */
export function getStorageMode(): StorageMode {
  if (typeof window === "undefined") return "local";
  try {
    const raw = window.localStorage.getItem(STORAGE_MODE_KEY);
    return raw === "cloud" ? "cloud" : "local";
  } catch {
    // Safari 프라이빗 모드 등 localStorage 접근 실패
    return "local";
  }
}

/**
 * 저장소 모드를 설정한다. **rehydration 을 트리거하지 않는다.** 호출자는
 * 이어서 `window.location.reload()` 를 호출해 모든 store 를 새 backend 로부터
 * 재하이드레이션해야 한다 (hot swap 은 race condition 때문에 v1 범위에서 제외).
 */
export function setStorageMode(mode: StorageMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_MODE_KEY, mode);
  } catch {
    // 쓰기 실패는 묵인 — 호출자가 reload 전에 감지 가능한 방법이 없으므로
    // 조용히 무시하고 모드 전환만 포기한다.
  }
}
