import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllStocks, fetchStockDailyPrice, type StockRef } from "./naver.js";

/**
 * fetch 를 URL 패턴으로 분기 mocking 한다. 내부 rate-limit sleep (200ms) 과
 * http.ts 의 backoff 때문에 fake timer 조합 필요.
 */

interface NaverListBody {
  totalCount: number;
  stocks: Array<{ itemCode: string; stockName: string }>;
}

function makeFetchMock(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response> | Error
) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    const r = await respond(urlStr, init);
    if (r instanceof Error) throw r;
    return r;
  });
}

function jsonBody(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function buildListBody(market: "KOSPI" | "KOSDAQ", count: number): NaverListBody {
  return {
    totalCount: count,
    stocks: Array.from({ length: count }, (_, i) => ({
      itemCode: `${market === "KOSPI" ? "0" : "1"}${String(i).padStart(5, "0")}`,
      stockName: `${market}-stock-${i}`,
    })),
  };
}

describe("fetchAllStocks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("KOSPI + KOSDAQ 모두 성공: 합쳐서 정확한 개수 반환", async () => {
    const fetchMock = makeFetchMock((url) => {
      if (url.includes("KOSPI")) return jsonBody(buildListBody("KOSPI", 3));
      if (url.includes("KOSDAQ")) return jsonBody(buildListBody("KOSDAQ", 2));
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchAllStocks();
    await vi.runAllTimersAsync();
    const stocks = await promise;

    expect(stocks).toHaveLength(5);
    expect(stocks.filter((s) => s.market === "KOSPI")).toHaveLength(3);
    expect(stocks.filter((s) => s.market === "KOSDAQ")).toHaveLength(2);
  });

  it("KOSPI 실패 + KOSDAQ 성공: KOSDAQ만 반환 (부분 장애 격리)", async () => {
    const fetchMock = makeFetchMock((url) => {
      if (url.includes("KOSPI")) return new Response("boom", { status: 500 });
      if (url.includes("KOSDAQ")) return jsonBody(buildListBody("KOSDAQ", 4));
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchAllStocks();
    await vi.runAllTimersAsync();
    const stocks = await promise;

    expect(stocks).toHaveLength(4);
    expect(stocks.every((s) => s.market === "KOSDAQ")).toBe(true);
  });

  it("양쪽 모두 실패: throw", async () => {
    const fetchMock = makeFetchMock(() => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchAllStocks();
    const settled = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await settled;

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("KOSPI/KOSDAQ 모두 실패");
  });

  it("응답 shape 이상 (stocks 가 배열 아님): 부분 결과 반환 (양쪽 모두 이상 시 throw)", async () => {
    // KOSPI 만 shape 이상 → KOSPI 실패로 처리, KOSDAQ 성공 → KOSDAQ 결과만 반환
    const fetchMock = makeFetchMock((url) => {
      if (url.includes("KOSPI")) return jsonBody({ totalCount: 0, stocks: "not-an-array" });
      if (url.includes("KOSDAQ")) return jsonBody(buildListBody("KOSDAQ", 3));
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchAllStocks();
    await vi.runAllTimersAsync();
    const stocks = await promise;

    expect(stocks).toHaveLength(3);
    expect(stocks.every((s) => s.market === "KOSDAQ")).toBe(true);
  });
});

describe("fetchStockDailyPrice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const ref: StockRef = { market: "KOSPI", ticker: "005930" };

  it("네트워크 예외: null 반환 (전체 배치 중단 방지)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchStockDailyPrice(ref, new Date("2025-01-02"));
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("빈 배열 응답: null 반환", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchStockDailyPrice(ref, new Date("2025-01-02"));

    expect(result).toBeNull();
  });
});
