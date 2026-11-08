"use client";

import type { SyncedStoreBinding } from "@web/lib/sync/entity-sync-engine";
import { useDebtsStore } from "../stores/debts-store";
import type { DebtsItem } from "../types/types";

/** 부채 store 를 엔티티 동기화 엔진에 연결하는 접점. */
export const debtsSyncBinding: SyncedStoreBinding<DebtsItem> = {
  get: () => useDebtsStore.getState().debts,
  set: (debts) => useDebtsStore.setState({ debts }),
  subscribe: (listener) =>
    useDebtsStore.subscribe((state, prev) => listener(state.debts, prev.debts)),
};
