import { accountFetch } from "./account-storage";
import { downloadAllFromCloud, uploadAllToCloud } from "./storage-migration";
import { type StorageMode, saveStorageMode } from "./storage-mode";

const STORAGE_MODE_URL = "/api/me/storage-mode";

/**
 * 저장 방식을 고르지 않은 계정. `current` 는 계정이 지금 쓰는 방식 — 새 기기의 기본값이 아니라 서버
 * 값이다. 새 사용자는 null.
 */
export interface PendingStorageChoice {
  current: StorageMode | null;
}

/** 골라야 하면 그 정보, 이미 골랐거나 확인하지 못했으면 null (다음에 열 때 다시 묻는다). */
export async function fetchPendingStorageChoice(): Promise<PendingStorageChoice | null> {
  try {
    const res = await accountFetch(STORAGE_MODE_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      storageMode?: unknown;
      chosen?: unknown;
      inUse?: unknown;
    };
    if (body.chosen !== false) return null;
    if (body.inUse !== true) return { current: null };
    return { current: body.storageMode === "cloud" ? "cloud" : "local" };
  } catch {
    return null;
  }
}

/** `open`: 그대로 앱을 연다. `reload`: 저장 방식이 바뀌어 다시 불러와야 한다. */
export type StorageChoiceResult = "open" | "reload" | "failed";

/**
 * 고른 방식을 적용한다. 쓰던 방식 그대로면 골랐다는 것만 남긴다. 다르면 설정 화면의 전환처럼 먼저
 * 양쪽을 합치고, 서버에 저장된 뒤에만 이 기기의 모드를 바꾼다 (다시 시도해도 결과가 같다).
 */
export async function applyStorageChoice(
  current: StorageMode | null,
  next: StorageMode
): Promise<StorageChoiceResult> {
  // 아직 고른 적 없는 사용자의 기본값은 local.
  const switching = next !== (current ?? "local");
  try {
    if (switching) {
      if (next === "cloud") await uploadAllToCloud();
      else await downloadAllFromCloud();
    }
    const res = await accountFetch(STORAGE_MODE_URL, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storageMode: next, onlyIfUnchosen: true }),
    });
    // 다른 기기에서 먼저 골랐다 — 다시 불러와 그 방식을 따른다.
    if (res.status === 409) return "reload";
    if (!res.ok) return "failed";
  } catch {
    return "failed";
  }
  if (!switching) return "open";
  return (await saveStorageMode(next)) ? "reload" : "failed";
}
