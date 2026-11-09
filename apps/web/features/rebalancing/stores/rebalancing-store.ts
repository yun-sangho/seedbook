"use client";

import { createHybridStorage } from "@web/lib/hybrid-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { RebalancingResult, RebalancingSession } from "../types/types";
import {
  completeRebalancing,
  completeRebalancingTaskWith,
  toggleRebalancingTask,
} from "../utils/rebalancing-session";

export type StartRebalancingInput = Omit<RebalancingSession, "id" | "startedAt" | "completedAt">;

interface RebalancingState {
  /** 최근에 시작한 것이 앞. 진행 중 / 완료 기록이 함께 들어 있다. */
  sessions: RebalancingSession[];

  /** 새 리밸런싱을 시작하고 id 를 돌려준다. */
  startRebalancing: (input: StartRebalancingInput) => string;
  toggleTask: (sessionId: string, taskId: string) => void;
  /** 실제로 사고판 수량과 함께 완료로 기록한다 (이미 완료했으면 수량을 바꾼다). */
  completeTaskWith: (sessionId: string, taskId: string, executedQuantity: number) => void;
  /** 완료 기록으로 넘긴다. 계좌에 반영했으면 반영 후 구성을 함께 남긴다. */
  completeRebalancing: (sessionId: string, result?: RebalancingResult | null) => void;
  removeRebalancing: (sessionId: string) => void;
}

export const useRebalancingStore = create<RebalancingState>()(
  persist(
    (set) => ({
      sessions: [],

      startRebalancing: (input) => {
        const id = crypto.randomUUID();
        const session: RebalancingSession = {
          ...input,
          id,
          startedAt: new Date().toISOString(),
          completedAt: null,
        };
        set((state) => ({ sessions: [session, ...state.sessions] }));
        return id;
      },

      toggleTask: (sessionId, taskId) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? toggleRebalancingTask(s, taskId) : s
          ),
        }));
      },

      completeTaskWith: (sessionId, taskId, executedQuantity) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? completeRebalancingTaskWith(s, taskId, executedQuantity) : s
          ),
        }));
      },

      completeRebalancing: (sessionId, result = null) => {
        const now = new Date().toISOString();
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? completeRebalancing(s, now, result) : s
          ),
        }));
      },

      removeRebalancing: (sessionId) => {
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== sessionId) }));
      },
    }),
    {
      // local 모드면 localStorage, cloud 모드면 엔티티 동기화 (`rebalancing-sync-config.ts`).
      name: "rebalancing-storage",
      storage: createJSONStorage(() => createHybridStorage("rebalancing-storage")),
      version: 1,
      partialize: (state) => ({ sessions: state.sessions }),
    }
  )
);
