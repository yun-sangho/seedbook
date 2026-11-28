import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetStockPriceStoreForTests, useStockPriceStore } from "../stores/stock-price-store";
import type { StockHolding } from "../types/types";
import { PRICE_CACHE_TTL_MS } from "./stock-price-cache";
import { stockPriceKey, useStockPrices } from "./use-stock-prices";

const NOW = new Date("2024-01-15T10:00:00Z").getTime();

function holding(market: string, ticker: string): StockHolding {
  return { id: `${market}-${ticker}`, market, ticker, name: ticker, quantity: 10 } as StockHolding;
}

function priceResponse(prices: Array<{ market: string; ticker: string; close: number }>) {
  return new Response(
    JSON.stringify({
      prices: prices.map((p) => ({
        ...p,
        date: "2024-01-15",
        asOf: "2024-01-15T06:30:00.000Z",
        kind: "close",
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("useStockPrices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    __resetStockPriceStoreForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns cached prices on the very first render without fetching", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    useStockPriceStore.setState({
      entries: {
        "KOSPI:005930": {
          point: {
            close: 70000,
            date: "2024-01-15",
            asOf: "2024-01-15T06:30:00.000Z",
            kind: "close",
          },
          fetchedAt: NOW - 1000,
        },
      },
    });

    const { result } = renderHook(() => useStockPrices([holding("KOSPI", "005930")]));

    expect(result.current.prices.get(stockPriceKey("KOSPI", "005930"))).toEqual({
      close: 70000,
      date: "2024-01-15",
      asOf: "2024-01-15T06:30:00.000Z",
      kind: "close",
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports isLoading until an uncached price arrives", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      priceResponse([{ market: "KOSPI", ticker: "005930", close: 70000 }])
    );

    const { result } = renderHook(() => useStockPrices([holding("KOSPI", "005930")]));
    expect(result.current.isLoading).toBe(true);

    await act(() => vi.runOnlyPendingTimersAsync());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.prices.get("KOSPI:005930")?.close).toBe(70000);
  });

  it("serves a stale cached price immediately and marks it as fetching, not loading", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise<Response>(() => {}));
    useStockPriceStore.setState({
      entries: {
        "KOSPI:005930": {
          point: {
            close: 70000,
            date: "2024-01-14",
            asOf: "2024-01-14T06:30:00.000Z",
            kind: "close",
          },
          fetchedAt: NOW - PRICE_CACHE_TTL_MS - 1,
        },
      },
    });

    const { result } = renderHook(() => useStockPrices([holding("KOSPI", "005930")]));

    expect(result.current.prices.get("KOSPI:005930")?.close).toBe(70000);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(true);
  });

  it("ignores legacy holdings without market/ticker", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { result } = renderHook(() => useStockPrices([holding("", "")]));

    expect(result.current.prices.size).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns only the prices of the requested holdings", () => {
    useStockPriceStore.setState({
      entries: {
        "KOSPI:005930": {
          point: {
            close: 70000,
            date: "2024-01-15",
            asOf: "2024-01-15T06:30:00.000Z",
            kind: "close",
          },
          fetchedAt: NOW,
        },
        "KOSPI:000660": {
          point: {
            close: 130000,
            date: "2024-01-15",
            asOf: "2024-01-15T06:30:00.000Z",
            kind: "close",
          },
          fetchedAt: NOW,
        },
      },
    });

    const { result } = renderHook(() => useStockPrices([holding("KOSPI", "005930")]));

    expect([...result.current.prices.keys()]).toEqual(["KOSPI:005930"]);
  });

  it("exposes an error when the price request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));

    const { result } = renderHook(() => useStockPrices([holding("KOSPI", "005930")]));
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.isLoading).toBe(false);
  });

  it("refetches prices once the cache expires while the screen stays open", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        priceResponse([{ market: "KOSPI", ticker: "005930", close: 70000 }])
      );
    useStockPriceStore.setState({
      entries: {
        "KOSPI:005930": {
          point: {
            close: 70000,
            date: "2024-01-15",
            asOf: "2024-01-15T06:30:00.000Z",
            kind: "close",
          },
          fetchedAt: NOW,
        },
      },
    });

    renderHook(() => useStockPrices([holding("KOSPI", "005930")]));
    await act(() => vi.advanceTimersByTimeAsync(PRICE_CACHE_TTL_MS + 1000));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refetches expired prices when the app returns to the foreground", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        priceResponse([{ market: "KOSPI", ticker: "005930", close: 70000 }])
      );
    useStockPriceStore.setState({
      entries: {
        "KOSPI:005930": {
          point: {
            close: 70000,
            date: "2024-01-15",
            asOf: "2024-01-15T06:30:00.000Z",
            kind: "close",
          },
          fetchedAt: NOW,
        },
      },
    });
    renderHook(() => useStockPrices([holding("KOSPI", "005930")]));

    // 백그라운드에 있는 동안 타이머가 멈췄다가 시계만 흐른 상황.
    vi.setSystemTime(NOW + PRICE_CACHE_TTL_MS + 1000);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.runOnlyPendingTimersAsync();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
