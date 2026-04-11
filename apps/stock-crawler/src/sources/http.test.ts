import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./http.js";

/**
 * 참고:
 * - `fetchWithRetry` 는 내부에서 backoff sleep (setTimeout 기반) 을 사용한다.
 *   fake timer 로 시간을 제어하지 않으면 3회 재시도 × 1~4초 만큼 테스트가 실제로
 *   대기한다. 각 테스트는 `vi.useFakeTimers()` + `vi.runAllTimersAsync()` 조합을 쓴다.
 * - `fetch` 는 global 이므로 `vi.stubGlobal` 로 목킹한다.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number): Response {
  return new Response("error body", {
    status,
    statusText: `HTTP ${status}`,
  });
}

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("200 응답: 한 번에 성공, fetch 1회 호출", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com/a");
    const body = (await res.json()) as { ok: boolean };

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ ok: true });
  });

  it("500 → 200: 재시도 1회 후 성공", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.com/a", {}, { backoffMs: 10 });
    // backoff sleep 진행
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("연속 500: retries 초과 시 throw (메시지에 label 포함)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry(
      "https://example.com/a",
      {},
      { retries: 2, backoffMs: 10, label: "my-req" }
    );
    // 모든 백오프가 풀리도록 진행하면서 rejection 을 확정시킨다.
    const settled = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await settled;

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("my-req");
    // 총 호출 = 1 (첫 시도) + 2 (재시도) = 3
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("429: retriable — 재시도 후 성공", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.com/a", {}, { backoffMs: 10 });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("404: non-retriable — 즉시 실패", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(404));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.com/a", {}, { retries: 5, backoffMs: 10 });
    const settled = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await settled;

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("non-retriable");
    // 재시도 없이 1회만 호출
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("네트워크 에러 (TypeError): 재시도 후 성공", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.com/a", {}, { backoffMs: 10 });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("타임아웃: AbortSignal 로 취소되면 재시도 후 성공", async () => {
    // 첫 호출은 signal 이 abort 될 때까지 pending → reject
    // 두 번째 호출은 즉시 성공
    let callIndex = 0;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      callIndex++;
      if (callIndex === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.com/a", {}, { timeoutMs: 100, backoffMs: 10 });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("backoff 지수 증가: 호출 간격이 1배, 2배, 4배", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    // backoffMs=1000 → 대기 1000, 2000, 4000
    // retries=3 이므로 총 4회 호출
    const promise = fetchWithRetry("https://example.com/a", {}, { retries: 3, backoffMs: 1000 });
    const settled = promise.catch((e) => e);

    // 첫 호출은 즉시
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 1000ms 경과 → 2번째 호출
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 다시 2000ms 경과 → 3번째 호출
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 다시 4000ms 경과 → 4번째(최종) 호출
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await settled;
  });
});
