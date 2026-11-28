"use client";

import { createHybridStorage } from "@mobile/lib/hybrid-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { RebalancingResult, RebalancingSession } from "../types/types";
import {
  clearRebalancingFills,
  closeRebalancingTask,
  completeRebalancing,
  recordRebalancingFill,
  toggleRebalancingTask,
} from "../utils/rebalancing-session";

export type StartRebalancingInput = Omit<RebalancingSession, "id" | "startedAt" | "completedAt">;

interface RebalancingState {
  /** 최근에 시작한 것이 앞. 진행 중 / 완료 기록이 함께 들어 있다. */
  sessions: RebalancingSession[];

  /** 새 리밸런싱을 시작하고 id 를 돌려준다. */
  startRebalancing: (input: StartRebalancingInput) => string;
  toggleTask: (sessionId: string, taskId: string) => void;
  /** 실제로 거래된 체결 한 건을 기록한다. 목표 수량을 채우면 할 일이 끝난다. */
  recordFill: (sessionId: string, taskId: string, quantity: number, price: number) => void;
  /** 남은 수량은 거래하지 않고 할 일을 끝낸다 ("남은 n주는 안 팔래요"). */
  closeTask: (sessionId: string, taskId: string) => void;
  /** 열려 있는 할 일의 체결 기록을 지운다. */
  clearFills: (sessionId: string, taskId: string) => void;
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

      recordFill: (sessionId, taskId, quantity, price) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? recordRebalancingFill(s, taskId, quantity, price) : s
          ),
        }));
      },

      closeTask: (sessionId, taskId) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? closeRebalancingTask(s, taskId) : s
          ),
        }));
      },

      clearFills: (sessionId, taskId) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? clearRebalancingFills(s, taskId) : s
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
      // 기기 레코드에 둔다 (`lib/hybrid-storage.ts`, cloud 모드면 동기화 v2).
      name: "rebalancing-storage",
      storage: createJSONStorage(() => createHybridStorage("rebalancing-storage")),
      partialize: (state) => ({ sessions: state.sessions }),
    }
  )
);
