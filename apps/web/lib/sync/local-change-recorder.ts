import { emptySyncMeta, recordLocalChange } from "./entity-sync-core";
import type { ManagedStoreConfig } from "./managed-store-config";
import { readSyncMeta, writeSyncMeta } from "./sync-meta-storage";

/**
 * store 가 저장(persist)될 때마다 바뀐 항목을 동기화 대기열에 기록한다.
 *
 * 기록은 저장 어댑터(hybrid-storage)에서 일어나므로 동기화 엔진이 돌고 있는지와 상관없다 —
 * 로그인 확인 전이나 세션 조회가 잠깐 실패한 사이에 한 수정도 대기열에 남고, 엔진이
 * (다시) 시작되면 보낸다. 엔진이 서버 변경을 store 에 반영할 때는 `withoutRecording` 으로
 * 감싸 되돌려 보내지 않게 한다.
 */

const suppressed = new Set<string>();
const listeners = new Map<string, Set<() => void>>();

/** 서버에서 받은 변경을 store 에 적용하는 동안의 저장은 기록하지 않는다. */
export function withoutRecording<R>(metaKey: string, fn: () => R): R {
  suppressed.add(metaKey);
  try {
    return fn();
  } finally {
    suppressed.delete(metaKey);
  }
}

/** 대기열에 새 변경이 기록될 때 알림을 받는다 (엔진이 전송을 예약한다). */
export function onLocalChange(metaKey: string, listener: () => void): () => void {
  let set = listeners.get(metaKey);
  if (!set) {
    set = new Set();
    listeners.set(metaKey, set);
  }
  set.add(listener);
  return () => set.delete(listener);
}

export function recordPersistedChange<T extends { id: string }>(
  config: ManagedStoreConfig<T>,
  prevRaw: string | null,
  nextRaw: string
): void {
  if (suppressed.has(config.metaKey)) return;
  const prev = itemsOf<T>(prevRaw, config.itemsField);
  const next = itemsOf<T>(nextRaw, config.itemsField);

  const stored = readSyncMeta(config.metaKey);
  const meta = stored?.meta ?? emptySyncMeta();
  const updated = recordLocalChange(meta, prev, next, config.toData);
  if (updated.seq === meta.seq) return; // 동기화할 데이터는 그대로 (UI 필드만 바뀜).

  writeSyncMeta(config.metaKey, { userId: stored?.userId ?? "", meta: updated });
  listeners.get(config.metaKey)?.forEach((listener) => listener());
}

function itemsOf<T>(raw: string | null, field: string): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const items = parsed.state?.[field];
    return Array.isArray(items) ? (items as T[]) : [];
  } catch {
    return [];
  }
}
