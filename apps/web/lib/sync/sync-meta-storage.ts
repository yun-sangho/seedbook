import type { SyncMeta } from "./entity-sync-core";

/**
 * 엔티티 동기화 상태(대기열·커서·version)를 localStorage 에 둔다. `userId` 는 대기열을
 * 기록한 사용자 — 아직 모를 때(하이드레이션 직후, 로그인 확인 전)는 빈 문자열이다.
 */
export type StoredMeta = { userId: string; meta: SyncMeta };

export function readSyncMeta(metaKey: string): StoredMeta | null {
  try {
    const raw = window.localStorage.getItem(metaKey);
    return raw ? (JSON.parse(raw) as StoredMeta) : null;
  } catch {
    return null;
  }
}

export function writeSyncMeta(metaKey: string, stored: StoredMeta): void {
  try {
    window.localStorage.setItem(metaKey, JSON.stringify(stored));
  } catch {
    // quota / private mode — 다음 pull 이 서버 기준으로 다시 맞춘다.
  }
}
