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
