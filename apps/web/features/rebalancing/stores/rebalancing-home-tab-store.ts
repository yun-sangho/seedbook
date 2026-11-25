"use client";

import { create } from "zustand";

export type RebalancingHomeTab = "in-progress" | "completed";

interface RebalancingHomeTabState {
  tab: RebalancingHomeTab;
  setTab: (tab: RebalancingHomeTab) => void;
}

/**
 * 리밸런싱 탭에서 보던 목록 (진행 중 / 완료 기록). 탭 화면은 숨겨도 남으므로, 다른 화면(홈 배너)에서
 * "진행 중" 을 열 수 있게 화면 밖에 둔다. 저장하지 않는다.
 */
export const useRebalancingHomeTab = create<RebalancingHomeTabState>()((set) => ({
  tab: "in-progress",
  setTab: (tab) => set({ tab }),
}));
