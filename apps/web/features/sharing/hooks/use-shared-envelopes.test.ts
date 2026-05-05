import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useViewContextStore,
  VIEW_CONTEXT_SESSION_KEY,
} from "@web/features/sharing/stores/view-context-store";
import {
  __resetSharedEnvelopeCacheForTests,
  useSharedEnvelopes,
} from "./use-shared-envelopes";

/**
 * `useSharedEnvelopes` 는 active aggregate owner 들의 envelope 을 fetch 한다.
 * fetch 를 mock 해 모드/owner 별 동작을 검증한다.
 */
describe("useSharedEnvelopes", () => {
  beforeEach(() => {
    __resetSharedEnvelopeCacheForTests();
    window.sessionStorage.clear();
    // 매 테스트마다 store 를 깨끗하게 재초기화 — 상태가 모듈 싱글턴이라
    // setMode/aggregateOwners 를 직접 만져 깨끗한 상태로 둔다.
    useViewContextStore.setState({
      mode: "aggregate",
      fullSwitch: null,
      aggregateOwners: [],
      aggregateFilter: [],
      aggregateGrouping: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("aggregate owner 가 없으면 fetch 하지 않고 빈 맵 반환", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useSharedEnvelopes("investment-storage"));

    expect(result.current.envelopes.size).toBe(0);
    expect(result.current.loading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("full-switch 모드면 owner 가 있어도 fetch 하지 않는다", () => {
    useViewContextStore.setState({
      mode: "full-switch",
      fullSwitch: { ownerId: "u1", ownerName: "친구", label: null },
      aggregateOwners: [{ ownerId: "u2", ownerName: "다른친구", label: null }],
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useSharedEnvelopes("investment-storage"));

    expect(result.current.envelopes.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("active owner 들에 대해 owner 별 storage 라우트로 fetch", async () => {
    useViewContextStore.setState({
      mode: "aggregate",
      fullSwitch: null,
      aggregateOwners: [
        { ownerId: "u1", ownerName: "A", label: null },
        { ownerId: "u2", ownerName: "B", label: "공동" },
      ],
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const ownerId = String(url).match(/view\/([^/]+)\/storage/)?.[1] ?? "";
      return new Response(
        JSON.stringify({
          data: { state: { investments: [{ id: `${ownerId}-acc` }] }, version: 5 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const { result } = renderHook(() => useSharedEnvelopes("investment-storage"));

    await waitFor(() => {
      expect(result.current.envelopes.size).toBe(2);
      expect(result.current.loading).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.envelopes.get("u1")?.envelope?.state.investments).toEqual([
      { id: "u1-acc" },
    ]);
    expect(result.current.envelopes.get("u2")?.owner.ownerName).toBe("B");
  });

  it("HTTP 실패는 envelope=null 로 들어온다", async () => {
    useViewContextStore.setState({
      mode: "aggregate",
      fullSwitch: null,
      aggregateOwners: [{ ownerId: "u1", ownerName: "A", label: null }],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("forbidden", { status: 403 }));

    const { result } = renderHook(() => useSharedEnvelopes("investment-storage"));

    await waitFor(() => {
      expect(result.current.envelopes.size).toBe(1);
    });
    expect(result.current.envelopes.get("u1")?.envelope).toBeNull();
  });

  it("두 번째 호출은 캐시 hit — fetch 가 늘어나지 않는다", async () => {
    useViewContextStore.setState({
      mode: "aggregate",
      fullSwitch: null,
      aggregateOwners: [{ ownerId: "u1", ownerName: "A", label: null }],
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { state: { investments: [] }, version: 1 } }), {
        status: 200,
      }),
    );

    const { result, rerender } = renderHook(() => useSharedEnvelopes("investment-storage"));
    await waitFor(() => expect(result.current.envelopes.size).toBe(1));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rerender();
    await waitFor(() => expect(result.current.envelopes.size).toBe(1));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("VIEW_CONTEXT_SESSION_KEY 와 정확히 같은 키를 sessionStorage 에 쓰는지 확인 (회귀 방지)", () => {
    // 이 테스트는 view-context-store 가 다른 키로 잘못 저장하기 시작하면 잡아준다.
    useViewContextStore.getState().setAggregateGrouping(true);
    expect(window.sessionStorage.getItem(VIEW_CONTEXT_SESSION_KEY)).not.toBeNull();
  });
});
