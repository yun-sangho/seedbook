import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/** 테스트마다 하이드레이션을 끝낼 수 있는 가짜 persist store. */
const fakes = vi.hoisted(() => {
  const make = () => {
    let hydrated = false;
    const listeners = new Set<() => void>();
    return {
      persist: {
        hasHydrated: () => hydrated,
        onFinishHydration: (fn: () => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
      },
      finish: () => {
        hydrated = true;
        for (const fn of listeners) fn();
      },
    };
  };
  return {
    investment: make(),
    portfolio: make(),
    rebalancing: make(),
    harvest: make(),
    preferences: make(),
  };
});

vi.mock("@mobile/features/investments/stores/investment-store", () => ({
  useInvestmentStore: fakes.investment,
}));
vi.mock("@mobile/features/portfolio/stores/portfolio-store", () => ({
  usePortfolioStore: fakes.portfolio,
}));
vi.mock("@mobile/features/rebalancing/stores/rebalancing-store", () => ({
  useRebalancingStore: fakes.rebalancing,
}));
vi.mock("@mobile/features/garden/stores/harvest-store", () => ({
  useHarvestStore: fakes.harvest,
}));
vi.mock("@mobile/lib/preferences-store", () => ({ usePreferencesStore: fakes.preferences }));

const { useAllStoresHydrated } = await import("./zustand-hydration");

describe("useAllStoresHydrated", () => {
  it("waits for the saved screen settings too, so screens never draw with the default sort", () => {
    const { result } = renderHook(() => useAllStoresHydrated());

    act(() => {
      fakes.investment.finish();
      fakes.portfolio.finish();
      fakes.rebalancing.finish();
      fakes.harvest.finish();
    });
    expect(result.current).toBe(false);

    act(() => fakes.preferences.finish());
    expect(result.current).toBe(true);
  });
});
