"use client";

import type { SyncedStoreBinding } from "@web/lib/sync/entity-sync-engine";
import { usePortfolioStore } from "../stores/portfolio-store";
import type { PortfolioItem } from "../types/types";

/** 포트폴리오 store 를 엔티티 동기화 엔진에 연결하는 접점. */
export const portfolioSyncBinding: SyncedStoreBinding<PortfolioItem> = {
  get: () => usePortfolioStore.getState().portfolios,
  set: (portfolios) => usePortfolioStore.setState({ portfolios }),
};
