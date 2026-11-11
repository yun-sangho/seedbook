"use client";

import {
  parseCollapsedSections,
  type RebalancingTaskSection,
} from "@web/features/rebalancing/utils/collapsed-sections";
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
  /** 진행 중 리밸런싱에서 접어 둔 매매 섹션. 비어 있으면 모두 펼침. */
  rebalancingCollapsedSections: RebalancingTaskSection[];
  setRebalancingCollapsedSections: (sections: RebalancingTaskSection[]) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      rebalancingTaskSort: DEFAULT_REBALANCING_TASK_SORT,
      setRebalancingTaskSort: (sort) => {
        // 예전 캐시나 서버에서 온 값이 없어진 옵션이면 무시한다.
        if (isRebalancingTaskSort(sort)) set({ rebalancingTaskSort: sort });
      },
      rebalancingCollapsedSections: [],
      setRebalancingCollapsedSections: (sections) => {
        const parsed = parseCollapsedSections(sections);
        if (parsed) set({ rebalancingCollapsedSections: parsed });
      },
    }),
    {
      name: "seedbook.preferences",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        rebalancingTaskSort: state.rebalancingTaskSort,
        rebalancingCollapsedSections: state.rebalancingCollapsedSections,
      }),
      // 캐시에 없거나 이상한 값은 기본값을 그대로 둔다.
      merge: (persisted, current) => {
        const cached = (persisted ?? {}) as {
          rebalancingTaskSort?: unknown;
          rebalancingCollapsedSections?: unknown;
        };
        const sort = cached.rebalancingTaskSort;
        const sections = parseCollapsedSections(cached.rebalancingCollapsedSections);
        return {
          ...current,
          ...(isRebalancingTaskSort(sort) ? { rebalancingTaskSort: sort } : {}),
          ...(sections ? { rebalancingCollapsedSections: sections } : {}),
        };
      },
    }
  )
);
