"use client";

import type { SyncStatus } from "@mobile/lib/sync/v2/engine";
import { create } from "zustand";

/**
 * 클라우드 동기화 상태. UI 인디케이터가 이 store 를 구독해 현재 상태를 표시한다.
 *
 * - `idle` — 아무 작업 없음. 최근 저장 시각 `lastSyncedAt` 이 있을 수 있음.
 * - `saving` — 네트워크 요청이 진행 중.
 * - `offline` — 네트워크 실패. 요청이 큐에 쌓여 있으며 flush 대기 중.
 * - `error` — 서버가 4xx/5xx 응답을 돌려줬다. 재시도 필요.
 * - `unauthenticated` — 401. 로그인 가드가 로그인 화면으로 redirect 해야 한다.
 */
export type SyncState = "idle" | "saving" | "offline" | "error" | "unauthenticated";

interface SyncStatusState {
  state: SyncState;
  lastSyncedAt: number | null;
  pendingKeys: Set<string>;
  lastError: string | null;

  markSaving: (key: string) => void;
  markSaved: (key: string) => void;
  markOffline: (key: string) => void;
  markError: (key: string, error: string) => void;
  markUnauthenticated: () => void;

  /**
   * 동기화 v2 상태 (설계 §5.8): 마지막 성공 시각, 멈춘 이유, 보지 않은 격리. 건수·목록은 두지 않는다.
   * cloud 모드에서 엔진이 채운다.
   */
  sync: SyncStatus | null;
  setSyncStatus: (status: SyncStatus) => void;
}

/**
 * **persist 하지 않음** — 페이지 로드마다 리셋되는 휘발성 상태.
 */
export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  state: "idle",
  lastSyncedAt: null,
  pendingKeys: new Set(),
  lastError: null,

  markSaving: (key) =>
    set((prev) => {
      const next = new Set(prev.pendingKeys);
      next.add(key);
      return { state: "saving", pendingKeys: next };
    }),

  markSaved: (key) =>
    set((prev) => {
      const next = new Set(prev.pendingKeys);
      next.delete(key);
      return {
        state: next.size === 0 ? "idle" : "saving",
        pendingKeys: next,
        lastSyncedAt: Date.now(),
        lastError: null,
      };
    }),

  markOffline: (key) =>
    set((prev) => {
      const next = new Set(prev.pendingKeys);
      next.add(key);
      return { state: "offline", pendingKeys: next };
    }),

  markError: (key, error) =>
    set((prev) => {
      const next = new Set(prev.pendingKeys);
      next.add(key);
      return { state: "error", pendingKeys: next, lastError: error };
    }),

  markUnauthenticated: () => set({ state: "unauthenticated", lastError: "session expired" }),

  sync: null,
  setSyncStatus: (sync) => set({ sync }),
}));
