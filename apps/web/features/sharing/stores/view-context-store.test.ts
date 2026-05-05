import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentViewContext,
  SELF_FILTER_ID,
  VIEW_CONTEXT_SESSION_KEY,
} from "./view-context-store";

/**
 * view context 는 sessionStorage 에 `seedbook.viewContext` 키로 보관된다.
 * 모듈 레벨에서 직접 읽는 `getCurrentViewContext` 는 full-switch 모드일 때만
 * owner 를 반환한다 — aggregate 모드에서는 hybrid-storage 라우팅을 바꾸지
 * 않으므로 의도적으로 null.
 */

describe("getCurrentViewContext", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("sessionStorage 에 키가 없으면 null", () => {
    expect(getCurrentViewContext()).toBeNull();
  });

  it("legacy v1 envelope (ownerId/ownerName/label) 은 full-switch 로 해석", () => {
    window.sessionStorage.setItem(
      VIEW_CONTEXT_SESSION_KEY,
      JSON.stringify({ ownerId: "u1", ownerName: "홍길동", label: "아내" })
    );
    expect(getCurrentViewContext()).toEqual({
      ownerId: "u1",
      ownerName: "홍길동",
      label: "아내",
    });
  });

  it("aggregate 모드면 owner 가 있어도 hybrid-storage 가 라우팅을 안 바꾸도록 null", () => {
    window.sessionStorage.setItem(
      VIEW_CONTEXT_SESSION_KEY,
      JSON.stringify({
        mode: "aggregate",
        fullSwitch: null,
        aggregateOwners: [{ ownerId: "u1", ownerName: "홍길동", label: null }],
        aggregateFilter: [],
        aggregateGrouping: false,
      })
    );
    expect(getCurrentViewContext()).toBeNull();
  });

  it("full-switch 모드 + fullSwitch 가 있으면 그 owner 반환", () => {
    window.sessionStorage.setItem(
      VIEW_CONTEXT_SESSION_KEY,
      JSON.stringify({
        mode: "full-switch",
        fullSwitch: { ownerId: "u2", ownerName: "친구", label: null },
        aggregateOwners: [],
        aggregateFilter: [],
        aggregateGrouping: false,
      })
    );
    expect(getCurrentViewContext()?.ownerId).toBe("u2");
  });

  it("깨진 JSON 은 null", () => {
    window.sessionStorage.setItem(VIEW_CONTEXT_SESSION_KEY, "not json");
    expect(getCurrentViewContext()).toBeNull();
  });
});

describe("useViewContextStore actions", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  function stubLocation() {
    const hrefSetter = vi.fn();
    const locationStub = {} as Location;
    Object.defineProperty(locationStub, "href", {
      set: hrefSetter,
      get: () => "",
    });
    vi.stubGlobal("location", locationStub);
    return hrefSetter;
  }

  it("enterFullSwitch 가 sessionStorage 에 mode=full-switch 로 기록", async () => {
    const hrefSetter = stubLocation();
    const { useViewContextStore } = await import("./view-context-store");

    useViewContextStore.getState().enterFullSwitch({
      ownerId: "owner-1",
      ownerName: "공유자",
      label: "부모님",
    });

    const raw = window.sessionStorage.getItem(VIEW_CONTEXT_SESSION_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.mode).toBe("full-switch");
    expect(parsed.fullSwitch).toEqual({
      ownerId: "owner-1",
      ownerName: "공유자",
      label: "부모님",
    });
    expect(hrefSetter).toHaveBeenCalledWith("/assets");
  });

  it("toggleAggregateOwner 가 owner 를 추가/제거", async () => {
    stubLocation();
    const { useViewContextStore } = await import("./view-context-store");
    const owner = { ownerId: "u1", ownerName: "친구", label: null };

    useViewContextStore.getState().toggleAggregateOwner(owner);
    expect(useViewContextStore.getState().aggregateOwners).toHaveLength(1);

    useViewContextStore.getState().toggleAggregateOwner(owner);
    expect(useViewContextStore.getState().aggregateOwners).toHaveLength(0);
  });

  it("toggleAggregateFilter 토글", async () => {
    stubLocation();
    const { useViewContextStore } = await import("./view-context-store");

    useViewContextStore.getState().toggleAggregateFilter(SELF_FILTER_ID);
    expect(useViewContextStore.getState().aggregateFilter).toEqual([SELF_FILTER_ID]);
    useViewContextStore.getState().toggleAggregateFilter(SELF_FILTER_ID);
    expect(useViewContextStore.getState().aggregateFilter).toEqual([]);
  });

  it("setAggregateGrouping 이 sessionStorage 에 반영", async () => {
    stubLocation();
    const { useViewContextStore } = await import("./view-context-store");

    useViewContextStore.getState().setAggregateGrouping(true);
    const raw = window.sessionStorage.getItem(VIEW_CONTEXT_SESSION_KEY);
    expect(JSON.parse(raw!).aggregateGrouping).toBe(true);
  });
});
