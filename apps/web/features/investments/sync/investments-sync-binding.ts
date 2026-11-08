"use client";

import type { SyncedStoreBinding } from "@web/lib/sync/entity-sync-engine";
import { useInvestmentStore } from "../stores/investment-store";
import type { InvestmentItem } from "../types/types";

/** 투자 store 를 엔티티 동기화 엔진에 연결하는 접점. */
export const investmentsSyncBinding: SyncedStoreBinding<InvestmentItem> = {
  get: () => useInvestmentStore.getState().investments,
  set: (investments) => useInvestmentStore.setState({ investments }),
};
