import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRICE_CACHE_TTL_MS } from "../utils/stock-price-cache";
import { __resetStockPriceStoreForTests, useStockPriceStore } from "./stock-price-store";

const NOW = new Date("2024-01-15T10:00:00Z").getTime();

function priceResponse(prices: Array<{ market: string; ticker: string; close: number }>) {
  return new Response(
    JSON.stringify({ prices: prices.map((p) => ({ ...p, date: "2024-01-15" })) }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function requestedItems(fetchSpy: { mock: { calls: unknown[][] } }, call = 0) {
  const init = fetchSpy.mock.calls[call]?.[1] as RequestInit;
  return (JSON.parse(init.body as string) as { items: unknown[] }).items;
}

describe("useStockPriceStore.ensurePrices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    __resetStockPriceStoreForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("fetches uncached keys and stores the result with fetchedAt", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(priceResponse([{ market: "KOSPI", ticker: "005930", close: 70000 }]));

    useStockPriceStore.getState().ensurePrices(["KOSPI:005930"]);
    await vi.runAllTimersAsync();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(useStockPriceStore.getState().entries["KOSPI:005930"]).toEqual({
      point: { close: 70000, date: "2024-01-15" },
      fetchedAt: NOW,
    });
  });

  it("does not hit the server for keys that are cached and fresh", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    useStockPriceStore.setState({
      entries: {
        "KOSPI:005930": { point: { close: 70000, date: "2024-01-15" }, fetchedAt: NOW - 1000 },
      },
    });

    useStockPriceStore.getState().ensurePrices(["KOSPI:005930"]);
    await vi.runAllTimersAsync();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requests only the keys that are missing from the cache", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(priceResponse([{ market: "KOSPI", ticker: "000660", close: 130000 }]));
    useStockPriceStore.setState({
      entries: {
        "KOSPI:005930": { point: { close: 70000, date: "2024-01-15" }, fetchedAt: NOW - 1000 },
      },
    });

    useStockPriceStore.getState().ensurePrices(["KOSPI:005930", "KOSPI:000660"]);
    await vi.runAllTimersAsync();

    expect(requestedItems(fetchSpy)).toEqual([{ market: "KOSPI", ticker: "000660" }]);
  });

  it("refetches stale entries but keeps serving the cached value meanwhile", async () => {
    let resolveFetch: (res: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );
    const stale = {
      point: { close: 70000, date: "2024-01-14" },
      fetchedAt: NOW - PRICE_CACHE_TTL_MS - 1,
    };
    useStockPriceStore.setState({ entries: { "KOSPI:005930": stale } });

    useStockPriceStore.getState().ensurePrices(["KOSPI:005930"]);
    await vi.runAllTimersAsync();
    expect(useStockPriceStore.getState().entries["KOSPI:005930"]).toEqual(stale);

    resolveFetch(priceResponse([{ market: "KOSPI", ticker: "005930", close: 71000 }]));
    await vi.runAllTimersAsync();
    expect(useStockPriceStore.getState().entries["KOSPI:005930"]?.point?.close).toBe(71000);
  });

  it("batches concurrent requests from several callers into one fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      priceResponse([
        { market: "KOSPI", ticker: "005930", close: 70000 },
        { market: "KOSPI", ticker: "000660", close: 130000 },
      ])
    );

    useStockPriceStore.getState().ensurePrices(["KOSPI:005930"]);
    useStockPriceStore.getState().ensurePrices(["KOSPI:005930", "KOSPI:000660"]);
    await vi.runAllTimersAsync();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(requestedItems(fetchSpy)).toEqual([
      { market: "KOSPI", ticker: "005930" },
      { market: "KOSPI", ticker: "000660" },
    ]);
  });

  it("caches a key the server has no price for, so it is not requested again", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(priceResponse([]));

    useStockPriceStore.getState().ensurePrices(["KOSPI:999999"]);
    await vi.runAllTimersAsync();
    useStockPriceStore.getState().ensurePrices(["KOSPI:999999"]);
    await vi.runAllTimersAsync();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(useStockPriceStore.getState().entries["KOSPI:999999"]).toEqual({
      point: null,
      fetchedAt: NOW,
    });
  });

  it("records an error and keeps the cached value when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
    const stale = {
      point: { close: 70000, date: "2024-01-14" },
      fetchedAt: NOW - PRICE_CACHE_TTL_MS - 1,
    };
    useStockPriceStore.setState({ entries: { "KOSPI:005930": stale } });

    useStockPriceStore.getState().ensurePrices(["KOSPI:005930"]);
    await vi.runAllTimersAsync();

    const state = useStockPriceStore.getState();
    expect(state.entries["KOSPI:005930"]).toEqual(stale);
    expect(state.errors["KOSPI:005930"]).toMatch(/500/);
    expect(state.inFlight["KOSPI:005930"]).toBeUndefined();
  });
});
