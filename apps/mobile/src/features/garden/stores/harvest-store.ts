"use client";

import type { HarvestItem } from "@mobile/features/portfolio/utils/plant-season";
import { createHybridStorage } from "@mobile/lib/hybrid-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 수확 기록 store 의 persist 키 (`lib/sync/v2/store-records.ts` `HARVEST_STORE`). */
export const HARVEST_STORAGE_KEY = "harvest-storage";

interface HarvestState {
  /** 수확 기록 (바구니). 최근 수확이 앞. 포트폴리오를 지워도 남는다. */
  harvests: HarvestItem[];

  /**
   * 수확 기록을 남긴다. 같은 id (같은 포트폴리오·수확 주기) 가 이미 있으면 그 기록을 그대로 둔다 —
   * 두 기기가 같은 열매를 수확해도 하나다.
   */
  addHarvest: (harvest: HarvestItem) => void;
  /** 소원을 "했어요" 로 표시한다. 다시 부르면 취소한다. */
  toggleHarvestDone: (id: string, now?: string) => void;
}

export const useHarvestStore = create<HarvestState>()(
  persist(
    (set) => ({
      harvests: [],

      addHarvest: (harvest) => {
        set((state) =>
          state.harvests.some((h) => h.id === harvest.id)
            ? state
            : { harvests: [harvest, ...state.harvests] }
        );
      },

      toggleHarvestDone: (id, now = new Date().toISOString()) => {
        set((state) => ({
          harvests: state.harvests.map((h) =>
            h.id === id ? { ...h, doneAt: h.doneAt === null ? now : null } : h
          ),
        }));
      },
    }),
    {
      // 기기 레코드에 둔다 (`lib/hybrid-storage.ts`, cloud 모드면 동기화 v2).
      name: HARVEST_STORAGE_KEY,
      storage: createJSONStorage(() => createHybridStorage(HARVEST_STORAGE_KEY)),
      partialize: (state) => ({ harvests: state.harvests }),
    }
  )
);
