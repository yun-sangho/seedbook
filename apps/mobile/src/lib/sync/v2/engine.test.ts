import {
  ACCOUNT_A,
  envelope,
  investmentState,
} from "@mobile/lib/native/device-db/testing/envelope-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncEngine } from "./engine";
import { INVESTMENT_STORE } from "./store-records";
import { memoryDevice } from "./testing";

const EMPTY_PULL = { protocol: 2, records: [], cursor: "c1", hasMore: false, reset: false };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("sync engine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the sync protocol and schema headers", async () => {
    const fetch = vi.fn(async () => json(EMPTY_PULL));
    const { layer } = memoryDevice();
    const engine = createSyncEngine({
      layer,
      fetchFn: fetch as unknown as typeof globalThis.fetch,
      client: "test",
    });

    await engine.sync();

    const headers = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers;
    expect(headers).toMatchObject({ "x-seedbook-sync": "2", "x-seedbook-schema": "1" });
  });

  it("stops on 426 and reports that an update is needed", async () => {
    const onStatus = vi.fn();
    const { layer } = memoryDevice();
    const engine = createSyncEngine({
      layer,
      fetchFn: async () => json({ code: "schema_too_old" }, 426),
      client: "test",
      onStatus,
    });

    expect(await engine.start()).toBe("stopped");
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ stoppedReason: "update_required" })
    );
    // 멈추면 스스로 다시 시도하지 않는다.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps edits on the device while stopped and sends them after an update", async () => {
    let status = 426;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (status !== 200) return json({}, status);
      if (!url.includes("push")) return json(EMPTY_PULL);
      const { ops } = JSON.parse(String(init?.body)) as { ops: unknown[] };
      return json({
        results: ops.map((_, i) => ({ status: "ok", version: 1, changeSeq: `${i}` })),
      });
    });
    const { layer } = memoryDevice();
    const engine = createSyncEngine({
      layer,
      fetchFn: fetch as unknown as typeof globalThis.fetch,
      client: "test",
    });
    await engine.start();
    await layer.saveStore(INVESTMENT_STORE, envelope(investmentState(), 6));

    expect(Object.keys(layer.loadState().outbox)).toContain(`account:${ACCOUNT_A}`);

    status = 200;
    expect(await engine.resume()).toBe("ok");
    expect(layer.loadState().outbox).toEqual({});
  });

  it("retries network failures with a growing delay up to 60 seconds", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("offline");
    });
    const { layer } = memoryDevice();
    const engine = createSyncEngine({
      layer,
      fetchFn: fetch as unknown as typeof globalThis.fetch,
      client: "test",
      random: () => 1,
    });

    await engine.start();
    const delays: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const before = Date.now();
      await vi.advanceTimersToNextTimerAsync();
      delays.push(Date.now() - before);
    }

    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]);
  });

  it("gives up on a request after 15 seconds and retries", async () => {
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted")));
        })
    );
    const { layer } = memoryDevice();
    const engine = createSyncEngine({
      layer,
      fetchFn: fetch as unknown as typeof globalThis.fetch,
      client: "test",
    });

    const outcome = engine.sync();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(await outcome).toBe("retry");
  });

  it("records the time of the last successful sync", async () => {
    const { layer } = memoryDevice();
    const engine = createSyncEngine({
      layer,
      fetchFn: async () => json(EMPTY_PULL),
      client: "test",
      now: () => "2026-11-28T01:00:00.000Z",
    });

    await engine.sync();

    expect(engine.status().lastSuccessAt).toBe("2026-11-28T01:00:00.000Z");
    expect(layer.loadState().cursor).toBe("c1");
  });
});
