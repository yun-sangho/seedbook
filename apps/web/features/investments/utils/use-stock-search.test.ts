import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Stock } from "../types/stock";
import { useStockSearch } from "./use-stock-search";

const mockStocks: Stock[] = [
  { market: "KOSPI", ticker: "005930", name: "삼성전자", currency: "KRW" },
  { market: "KOSPI", ticker: "000660", name: "SK하이닉스", currency: "KRW" },
];

describe("useStockSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns empty results immediately for empty query", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useStockSearch(""));
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("debounces fetch by 200ms before calling the search API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: mockStocks }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useStockSearch("삼성"));

    // Before debounce elapses, no fetch fired.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.current.results).toEqual(mockStocks);
    });
  });

  it("encodes the query into the URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );

    renderHook(() => useStockSearch("삼성 전자"));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/stocks/search?q=%EC%82%BC%EC%84%B1%20%EC%A0%84%EC%9E%90",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it("resets to empty when query becomes empty after a search", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: mockStocks }), { status: 200 }),
    );

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useStockSearch(q),
      { initialProps: { q: "삼성" } },
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(result.current.results).toEqual(mockStocks);
    });

    rerender({ q: "" });

    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("falls back to empty array and sets error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 500 }),
    );

    const { result } = renderHook(() => useStockSearch("zzzzzz"));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.results).toEqual([]);
      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  it("aborts the previous request when query changes mid-flight", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        }),
    );

    const { rerender } = renderHook(
      ({ q }: { q: string }) => useStockSearch(q),
      { initialProps: { q: "삼" } },
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstSignal = (fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)
      ?.signal;
    expect(firstSignal?.aborted).toBe(false);

    rerender({ q: "삼성" });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(firstSignal?.aborted).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
