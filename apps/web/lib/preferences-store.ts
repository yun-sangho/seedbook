"use client";

import {
  DEFAULT_REBALANCING_TASK_SORT,
  isRebalancingTaskSort,
  type RebalancingTaskSort,
} from "@web/features/rebalancing/utils/sort-rebalancing-tasks";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * 개인 설정. 기준값은 계정(`/api/me/preferences`)이고, 이 기기에는 첫 화면을 바로 그리기 위한
 * 캐시로만 남긴다 — 로그인하면 `PreferencesSync` 가 계정 값으로 맞춘다.
 *
 * 데이터 store 와 달리 엔티티 동기화·저장소 모드(local/cloud)와 무관해 localStorage 에 직접 둔다.
 */
interface PreferencesState {
  rebalancingTaskSort: RebalancingTaskSort;
  setRebalancingTaskSort: (sort: RebalancingTaskSort) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      rebalancingTaskSort: DEFAULT_REBALANCING_TASK_SORT,
      setRebalancingTaskSort: (sort) => {
        // 예전 캐시나 서버에서 온 값이 없어진 옵션이면 무시한다.
        if (isRebalancingTaskSort(sort)) set({ rebalancingTaskSort: sort });
      },
    }),
    {
      name: "seedbook.preferences",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ rebalancingTaskSort: state.rebalancingTaskSort }),
      merge: (persisted, current) => {
        const sort = (persisted as { rebalancingTaskSort?: unknown } | undefined)
          ?.rebalancingTaskSort;
        return isRebalancingTaskSort(sort) ? { ...current, rebalancingTaskSort: sort } : current;
      },
    }
  )
);
