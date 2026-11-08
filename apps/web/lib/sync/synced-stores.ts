"use client";

import { investmentsSyncBinding } from "@web/features/investments/sync/investments-sync-binding";
import { investmentsSyncConfig } from "@web/features/investments/sync/investments-sync-config";
import { portfolioSyncBinding } from "@web/features/portfolio/sync/portfolio-sync-binding";
import { portfolioSyncConfig } from "@web/features/portfolio/sync/portfolio-sync-config";
import { rebalancingSyncBinding } from "@web/features/rebalancing/sync/rebalancing-sync-binding";
import { rebalancingSyncConfig } from "@web/features/rebalancing/sync/rebalancing-sync-config";
import type { SyncedStoreBinding } from "./entity-sync-engine";
import type { ManagedStoreConfig } from "./managed-store-config";

type SyncedStore<T extends { id: string }> = {
  config: ManagedStoreConfig<T>;
  binding: SyncedStoreBinding<T>;
};

const entry = <T extends { id: string }>(
  config: ManagedStoreConfig<T>,
  binding: SyncedStoreBinding<T>
) => ({ config, binding }) as unknown as SyncedStore<{ id: string }>;

/**
 * cloud 모드에서 EntitySyncRunner 가 동기화를 돌리는 store 들 (설정 + store 접점).
 * `managed-stores.ts` 의 설정 목록과 짝을 맞춘다 — 그쪽은 store 를 import 할 수 없어
 * (hybrid-storage 가 store 보다 먼저 읽는다) 설정만 따로 둔다.
 */
export const SYNCED_STORES: SyncedStore<{ id: string }>[] = [
  entry(investmentsSyncConfig, investmentsSyncBinding),
  entry(portfolioSyncConfig, portfolioSyncBinding),
  entry(rebalancingSyncConfig, rebalancingSyncBinding),
];
