import { debtsSyncConfig } from "@web/features/debts/sync/debts-sync-config";
import type { ManagedStoreConfig } from "./managed-store-config";

/**
 * cloud 모드에서 envelope 대신 엔티티 동기화(`/api/sync/*`)로 저장하는 store 들.
 * 도메인을 하나씩 옮길 때마다 여기에 추가한다.
 */
export const SYNC_MANAGED_STORES: Record<string, ManagedStoreConfig<{ id: string }>> = {
  [debtsSyncConfig.storageKey]: debtsSyncConfig as unknown as ManagedStoreConfig<{ id: string }>,
};

export function getManagedStoreConfig(key: string): ManagedStoreConfig<{ id: string }> | null {
  return SYNC_MANAGED_STORES[key] ?? null;
}

/**
 * 엔티티 동기화의 로컬 상태(대기열·커서·version)를 지운다. 저장소 모드를 바꿀 때 쓴다 —
 * 아직 보내지 않은 변경은 모드 전환 병합으로 데이터 쪽에 이미 남아 있고, 다시 클라우드를
 * 켜면 하이드레이션이 서버 전체 pull 로 새로 시작한다.
 */
export function clearEntitySyncState(): void {
  for (const config of Object.values(SYNC_MANAGED_STORES)) {
    try {
      window.localStorage.removeItem(config.metaKey);
    } catch {
      // noop
    }
  }
}
