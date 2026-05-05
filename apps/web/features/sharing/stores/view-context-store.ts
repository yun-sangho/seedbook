"use client";

import { create } from "zustand";

/**
 * 공유받은 사용자 데이터 열람 컨텍스트.
 *
 * 두 가지 모드가 있다:
 *
 * - `full-switch`: 한 명의 owner 데이터로 통째 전환. 모든 store 가 그 사용자
 *   envelope 으로 재하이드레이션 된다 (hybrid-storage 가 GET 을 owner 라우트로
 *   라우팅). 진입/이탈은 hard reload 동반.
 *
 * - `aggregate`: 내 데이터를 그대로 두고 활성화된 owner 들의 데이터를
 *   사이드채널로 가져와 페이지 단계에서 머지해 보여준다. 페이지마다 출처
 *   라벨을 표시하고, 묶기 옵션 / 사용자별 필터를 적용한다. 모드 전환은
 *   reload 가 필요 없음 — sessionStorage 만 갱신.
 *
 * sessionStorage 에 저장해 탭별 자동 종료. localStorage 가 아닌 이유는
 * 다른 탭에서의 모드 전환을 의도치 않게 따라가지 않기 위함.
 */

export const VIEW_CONTEXT_SESSION_KEY = "seedbook.viewContext";

export type ViewMode = "full-switch" | "aggregate";

export type SharedOwner = {
  ownerId: string;
  ownerName: string;
  label: string | null;
};

export type ViewContextState = {
  mode: ViewMode;
  /** full-switch 모드에서만 사용. aggregate 일 때는 항상 null. */
  fullSwitch: SharedOwner | null;
  /** aggregate 모드: 데이터를 같이 보고 있는 owner 목록 (사용자가 활성화한). */
  aggregateOwners: SharedOwner[];
  /**
   * aggregate 모드 필터: 보이게 할 owner 의 id 집합. `__self__` 는 내 데이터를
   * 의미한다. 비어 있으면 "전부 표시" 로 해석.
   */
  aggregateFilter: string[];
  /** 묶기 모드 — owner 별로 섹션을 분리해 별도 정렬. false 면 섞어 정렬. */
  aggregateGrouping: boolean;
};

export const SELF_FILTER_ID = "__self__" as const;

const DEFAULT_STATE: ViewContextState = {
  mode: "aggregate",
  fullSwitch: null,
  aggregateOwners: [],
  aggregateFilter: [],
  aggregateGrouping: false,
};

interface ViewContextStore extends ViewContextState {
  enterFullSwitch: (owner: SharedOwner) => void;
  exitFullSwitch: () => void;
  setMode: (mode: ViewMode) => void;
  setAggregateOwners: (owners: SharedOwner[]) => void;
  toggleAggregateOwner: (owner: SharedOwner) => void;
  addAggregateOwner: (owner: SharedOwner) => void;
  removeAggregateOwner: (ownerId: string) => void;
  setAggregateFilter: (ownerIds: string[]) => void;
  toggleAggregateFilter: (id: string) => void;
  setAggregateGrouping: (enabled: boolean) => void;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isSharedOwner(value: unknown): value is SharedOwner {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ownerId === "string" &&
    typeof v.ownerName === "string" &&
    (v.label === null || typeof v.label === "string")
  );
}

function readSession(): ViewContextState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.sessionStorage.getItem(VIEW_CONTEXT_SESSION_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_STATE;
    const p = parsed as Record<string, unknown>;

    // 기존 v1 envelope (단일 ownerId/ownerName/label) 호환 — full-switch 로 해석.
    if (
      typeof p.ownerId === "string" &&
      typeof p.ownerName === "string" &&
      !("mode" in p)
    ) {
      return {
        ...DEFAULT_STATE,
        mode: "full-switch",
        fullSwitch: {
          ownerId: p.ownerId,
          ownerName: p.ownerName,
          label: typeof p.label === "string" ? p.label : null,
        },
      };
    }

    const mode = p.mode === "full-switch" ? "full-switch" : "aggregate";
    const fullSwitch = isSharedOwner(p.fullSwitch) ? p.fullSwitch : null;
    const aggregateOwners = Array.isArray(p.aggregateOwners)
      ? p.aggregateOwners.filter(isSharedOwner)
      : [];
    const aggregateFilter = isStringArray(p.aggregateFilter) ? p.aggregateFilter : [];
    const aggregateGrouping = typeof p.aggregateGrouping === "boolean" ? p.aggregateGrouping : false;

    return { mode, fullSwitch, aggregateOwners, aggregateFilter, aggregateGrouping };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeSession(state: ViewContextState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(VIEW_CONTEXT_SESSION_KEY, JSON.stringify(state));
  } catch {
    // private mode / quota — 조용히 무시.
  }
}

export const useViewContextStore = create<ViewContextStore>((set, get) => ({
  ...readSession(),

  enterFullSwitch: (owner) => {
    const next: ViewContextState = {
      ...get(),
      mode: "full-switch",
      fullSwitch: owner,
    };
    writeSession(next);
    set(next);
    if (typeof window !== "undefined") {
      // hybrid-storage 가 모드 캐시를 모듈 로드 시 결정하므로 reload 강제.
      window.location.href = "/assets";
    }
  },

  exitFullSwitch: () => {
    const next: ViewContextState = {
      ...get(),
      mode: "aggregate",
      fullSwitch: null,
    };
    writeSession(next);
    set(next);
    if (typeof window !== "undefined") {
      window.location.href = "/assets";
    }
  },

  setMode: (mode) => {
    const cur = get();
    if (cur.mode === mode) return;
    if (mode === "full-switch") {
      // full-switch 진입은 owner 가 정해져야 함 — UI 가 enterFullSwitch 호출.
      return;
    }
    const next: ViewContextState = { ...cur, mode: "aggregate", fullSwitch: null };
    writeSession(next);
    set(next);
    if (typeof window !== "undefined" && cur.mode === "full-switch") {
      // full-switch 에서 빠져나오는 거라면 reload 필요 (hybrid-storage 캐시 리셋).
      window.location.href = "/assets";
    }
  },

  setAggregateOwners: (owners) => {
    const next: ViewContextState = { ...get(), aggregateOwners: owners };
    writeSession(next);
    set(next);
  },

  toggleAggregateOwner: (owner) => {
    const cur = get();
    const exists = cur.aggregateOwners.some((o) => o.ownerId === owner.ownerId);
    const aggregateOwners = exists
      ? cur.aggregateOwners.filter((o) => o.ownerId !== owner.ownerId)
      : [...cur.aggregateOwners, owner];
    const aggregateFilter = exists
      ? cur.aggregateFilter.filter((id) => id !== owner.ownerId)
      : cur.aggregateFilter;
    const next: ViewContextState = { ...cur, aggregateOwners, aggregateFilter };
    writeSession(next);
    set(next);
  },

  addAggregateOwner: (owner) => {
    const cur = get();
    if (cur.aggregateOwners.some((o) => o.ownerId === owner.ownerId)) return;
    const next: ViewContextState = {
      ...cur,
      aggregateOwners: [...cur.aggregateOwners, owner],
    };
    writeSession(next);
    set(next);
  },

  removeAggregateOwner: (ownerId) => {
    const cur = get();
    if (!cur.aggregateOwners.some((o) => o.ownerId === ownerId)) return;
    const next: ViewContextState = {
      ...cur,
      aggregateOwners: cur.aggregateOwners.filter((o) => o.ownerId !== ownerId),
      aggregateFilter: cur.aggregateFilter.filter((id) => id !== ownerId),
    };
    writeSession(next);
    set(next);
  },

  setAggregateFilter: (ownerIds) => {
    const next: ViewContextState = { ...get(), aggregateFilter: ownerIds };
    writeSession(next);
    set(next);
  },

  toggleAggregateFilter: (id) => {
    const cur = get();
    const present = cur.aggregateFilter.includes(id);
    const aggregateFilter = present
      ? cur.aggregateFilter.filter((x) => x !== id)
      : [...cur.aggregateFilter, id];
    const next: ViewContextState = { ...cur, aggregateFilter };
    writeSession(next);
    set(next);
  },

  setAggregateGrouping: (enabled) => {
    const next: ViewContextState = { ...get(), aggregateGrouping: enabled };
    writeSession(next);
    set(next);
  },
}));

/**
 * React 없이 모듈 레벨에서 현재 뷰 컨텍스트를 읽는다 (hybrid-storage 어댑터용).
 *
 * full-switch 일 때만 owner 를 반환한다 — aggregate 모드는 hybrid-storage 의
 * 라우팅을 바꾸지 않고 사이드채널 fetch 로 처리하기 때문.
 */
export function getCurrentViewContext(): SharedOwner | null {
  const state = readSession();
  if (state.mode === "full-switch" && state.fullSwitch) return state.fullSwitch;
  return null;
}
