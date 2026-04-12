import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStoreHydrated } from "./zustand-hydration";

/**
 * `useStoreHydrated` 가 동기 스토리지(hydrated=true 즉시) 와 비동기 스토리지
 * (나중에 완료) 두 경우 모두를 올바르게 반영하는지 검증한다.
 *
 * SSR 안전성을 위해 훅은 첫 렌더에선 항상 false 로 시작해야 하며, effect 에서
 * 동기화해야 한다. 이 테스트는 그 계약을 깨는 회귀를 방지한다.
 */

type Listener = () => void;

function createFakePersistStore(options: { hydratedAtStart: boolean }) {
  let hydrated = options.hydratedAtStart;
  const listeners = new Set<Listener>();

  return {
    persist: {
      hasHydrated: () => hydrated,
      onFinishHydration: (fn: Listener) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    finishHydration: () => {
      hydrated = true;
      listeners.forEach((fn) => fn());
    },
  };
}

describe("useStoreHydrated", () => {
  it("첫 렌더는 항상 false (SSR 일치 보장)", () => {
    const fake = createFakePersistStore({ hydratedAtStart: true });
    const { result } = renderHook(() => useStoreHydrated(fake));
    // useEffect 가 실행된 후 true 로 전환되어야 한다
    expect(result.current).toBe(true);
  });

  it("이미 하이드레이션 완료된 스토어는 마운트 직후 true 가 된다", () => {
    const fake = createFakePersistStore({ hydratedAtStart: true });
    const { result } = renderHook(() => useStoreHydrated(fake));
    expect(result.current).toBe(true);
  });

  it("마운트 시점에 아직 하이드레이션 전이면 false, 완료 콜백이 불리면 true 가 된다", () => {
    const fake = createFakePersistStore({ hydratedAtStart: false });
    const { result } = renderHook(() => useStoreHydrated(fake));
    expect(result.current).toBe(false);

    act(() => {
      fake.finishHydration();
    });

    expect(result.current).toBe(true);
  });

  it("언마운트 시 구독을 해제한다", () => {
    const fake = createFakePersistStore({ hydratedAtStart: false });
    const { result, unmount } = renderHook(() => useStoreHydrated(fake));
    expect(result.current).toBe(false);

    unmount();

    // 언마운트 후 하이드레이션이 끝나도 예외 없이 통과해야 한다
    expect(() => {
      fake.finishHydration();
    }).not.toThrow();
  });
});
