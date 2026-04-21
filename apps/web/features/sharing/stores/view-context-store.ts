"use client";

import { create } from "zustand";

/**
 * 공유받은 사용자 데이터를 열람 중인지 여부를 추적하는 휘발성 스토어.
 *
 * sessionStorage 에 저장해 탭을 닫으면 자동 종료된다 (localStorage 는 탭 간
 * 공유되지만 sessionStorage 는 탭별이라 사용자 개별 흐름과 맞음). 모드 전환은
 * 반드시 `window.location.reload()` 를 트리거해 모든 하이브리드 스토리지 기반
 * 스토어가 깨끗하게 재하이드레이션되게 한다 — 부분 rehydrate 는 복잡도 대비
 * 이득이 없음.
 */

export const VIEW_CONTEXT_SESSION_KEY = "seedbook.viewContext";

export type ViewContext = {
  ownerId: string;
  ownerName: string;
  label: string | null;
};

interface ViewContextStore {
  shared: ViewContext | null;
  enterShared: (ctx: ViewContext) => void;
  exitShared: () => void;
}

function readSessionContext(): ViewContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(VIEW_CONTEXT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.ownerId === "string" &&
      typeof parsed.ownerName === "string" &&
      (parsed.label === null || typeof parsed.label === "string")
    ) {
      return parsed as ViewContext;
    }
    return null;
  } catch {
    return null;
  }
}

function writeSessionContext(ctx: ViewContext | null): void {
  if (typeof window === "undefined") return;
  try {
    if (ctx === null) {
      window.sessionStorage.removeItem(VIEW_CONTEXT_SESSION_KEY);
    } else {
      window.sessionStorage.setItem(VIEW_CONTEXT_SESSION_KEY, JSON.stringify(ctx));
    }
  } catch {
    // private mode / quota — 조용히 무시. 공유 모드는 로그아웃보다 덜 중요하다.
  }
}

export const useViewContextStore = create<ViewContextStore>((set) => ({
  shared: readSessionContext(),
  enterShared: (ctx) => {
    writeSessionContext(ctx);
    set({ shared: ctx });
    if (typeof window !== "undefined") {
      window.location.href = "/dashboard";
    }
  },
  exitShared: () => {
    writeSessionContext(null);
    set({ shared: null });
    if (typeof window !== "undefined") {
      window.location.href = "/dashboard";
    }
  },
}));

/**
 * React 없이 모듈 레벨에서 현재 view context 를 읽는다 (hybrid-storage 어댑터용).
 */
export function getCurrentViewContext(): ViewContext | null {
  if (typeof window === "undefined") return null;
  return readSessionContext();
}
