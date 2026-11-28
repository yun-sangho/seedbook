"use client";

import { useInvestmentStore } from "@mobile/features/investments/stores/investment-store";
import { usePortfolioStore } from "@mobile/features/portfolio/stores/portfolio-store";
import { useRebalancingStore } from "@mobile/features/rebalancing/stores/rebalancing-store";
import type { RecordStoreKey } from "./v2/store-records";

/**
 * 기기 레코드에 두는 store 들. 동기화가 레코드를 바꾸면 그 store 를 다시 읽는다 — `record-sync.ts` 는
 * store 보다 먼저 읽히므로(hybrid-storage) store 를 import 하지 않고 여기에 따로 둔다.
 */
const RECORD_STORES: Record<
  RecordStoreKey,
  { persist: { hasHydrated(): boolean; rehydrate(): Promise<void> | void } }
> = {
  "investment-storage": useInvestmentStore,
  "portfolio-storage": usePortfolioStore,
  "rebalancing-storage": useRebalancingStore,
};

/** 레코드에서 다시 읽는다. 아직 처음 읽기 전인 store 는 그대로 둔다 (곧 최신 레코드를 읽는다). */
export function rehydrateRecordStores(keys: RecordStoreKey[]): void {
  for (const key of keys) {
    const store = RECORD_STORES[key];
    if (store.persist.hasHydrated()) void store.persist.rehydrate();
  }
}
