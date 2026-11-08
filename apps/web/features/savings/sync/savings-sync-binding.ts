"use client";

import type { SyncedStoreBinding } from "@web/lib/sync/entity-sync-engine";
import { useSavingsStore } from "../stores/savings-store";
import type { SavingsItem } from "../types/types";

/** 저축 store 를 엔티티 동기화 엔진에 연결하는 접점. */
export const savingsSyncBinding: SyncedStoreBinding<SavingsItem> = {
  get: () => useSavingsStore.getState().savings,
  set: (savings) => useSavingsStore.setState({ savings }),
};
