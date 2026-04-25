import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentViewContext, VIEW_CONTEXT_SESSION_KEY } from "./view-context-store";

/**
 * view context 는 sessionStorage 에 `seedbook.viewContext` 키로 보관된다.
 * 모듈 레벨에서 직접 읽는 `getCurrentViewContext` 를 기준으로 검증한다.
 *
 * 스토어의 `enterShared` / `exitShared` 는 내부적으로
 * `window.location.href = "/assets"` 를 호출하므로 jsdom 에서 별도의
 * `location` 모킹 없이 호출하기는 어렵다. sessionStorage 쓰기 그 자체는
 * 모듈 레벨의 `writeSessionContext` 로 검증된다.
 */

describe("getCurrentViewContext", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("sessionStorage 에 키가 없으면 null 을 반환한다", () => {
    expect(getCurrentViewContext()).toBeNull();
  });

  it("유효한 JSON 이 있으면 파싱해 반환한다", () => {
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

  it("label 이 null 이어도 허용한다", () => {
    window.sessionStorage.setItem(
      VIEW_CONTEXT_SESSION_KEY,
      JSON.stringify({ ownerId: "u2", ownerName: "친구", label: null })
    );
    expect(getCurrentViewContext()?.label).toBeNull();
  });

  it("깨진 JSON 은 null 로 수렴한다", () => {
    window.sessionStorage.setItem(VIEW_CONTEXT_SESSION_KEY, "not json");
    expect(getCurrentViewContext()).toBeNull();
  });

  it("필수 필드가 빠지면 null", () => {
    window.sessionStorage.setItem(VIEW_CONTEXT_SESSION_KEY, JSON.stringify({ ownerId: "u3" }));
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

  it("enterShared 가 sessionStorage 에 context 를 기록한다", async () => {
    // `window.location.href = ...` 호출을 안전하게 처리하기 위한 jsdom 기본 location 을
    // 건드리지 않고 `window.location` 전체를 stub 한다.
    const hrefSetter = vi.fn();
    const locationStub = {} as Location;
    Object.defineProperty(locationStub, "href", {
      set: hrefSetter,
      get: () => "",
    });
    vi.stubGlobal("location", locationStub);

    // store 를 여기서 동적 import — stub 이 적용된 상태에서 초기화되도록.
    const { useViewContextStore } = await import("./view-context-store");

    useViewContextStore.getState().enterShared({
      ownerId: "owner-1",
      ownerName: "공유자",
      label: "부모님",
    });

    const raw = window.sessionStorage.getItem(VIEW_CONTEXT_SESSION_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({
      ownerId: "owner-1",
      ownerName: "공유자",
      label: "부모님",
    });
    expect(hrefSetter).toHaveBeenCalledWith("/assets");
  });

  it("exitShared 가 sessionStorage 를 비운다", async () => {
    window.sessionStorage.setItem(
      VIEW_CONTEXT_SESSION_KEY,
      JSON.stringify({ ownerId: "x", ownerName: "x", label: null })
    );

    const hrefSetter = vi.fn();
    const locationStub = {} as Location;
    Object.defineProperty(locationStub, "href", {
      set: hrefSetter,
      get: () => "",
    });
    vi.stubGlobal("location", locationStub);

    const { useViewContextStore } = await import("./view-context-store");
    useViewContextStore.getState().exitShared();

    expect(window.sessionStorage.getItem(VIEW_CONTEXT_SESSION_KEY)).toBeNull();
    expect(hrefSetter).toHaveBeenCalledWith("/assets");
  });
});
