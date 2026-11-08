"use client";

import type { SyncedStoreBinding } from "@web/lib/sync/entity-sync-engine";
import { useRebalancingStore } from "../stores/rebalancing-store";
import type { RebalancingSession } from "../types/types";

/** 리밸런싱 store 를 엔티티 동기화 엔진에 연결하는 접점. */
export const rebalancingSyncBinding: SyncedStoreBinding<RebalancingSession> = {
  get: () => useRebalancingStore.getState().sessions,
  set: (sessions) => useRebalancingStore.setState({ sessions }),
};
