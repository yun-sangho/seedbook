import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * cloud 모드에서 store (`rebalancing-storage` 등) 는 엔티티 동기화로 저장된다 —
 * envelope (`/api/storage`) 는 저장소 모드 전환에서만 쓴다. hybrid-storage 는 모드를 모듈 초기화 때 읽으므로
 * 테스트마다 모듈을 새로 불러온다.
 */

const sessionRow = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 2,
  deletedAt: null,
  data: {
    accountId: "acc-1",
    accountName: "연금저축",
    portfolioId: "pf-1",
    portfolioName: "안정형",
    cashDelta: 0,
    tasks: [],
    startedAt: "2026-11-08T00:00:00.000Z",
    completedAt: null,
  },
};

async function loadCloudStorage() {
  localStorage.setItem("seedbook.storageMode", "cloud");
  vi.resetModules();
  const mod = await import("./hybrid-storage");
  return mod.createHybridStorage;
}

describe("hybrid storage for sync-managed stores in cloud mode", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    // 레거시 number id 일회성 업그레이드는 이미 끝난 상태로 둔다 (실사용자와 같은 조건).
    localStorage.setItem("seedbook.localIdUpgraded.v1", "1");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("builds the persisted state from a full server pull", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          cursor: "c1",
          changes: {
            rebalancing: [sessionRow],
            listOrder: [{ domain: "rebalancings", order: [sessionRow.id] }],
          },
        })
      )
    );
    const storage = (await loadCloudStorage())("rebalancing-storage");

    const raw = await storage.getItem("rebalancing-storage");

    expect(fetchMock).toHaveBeenCalledWith("/api/sync/pull", expect.anything());
    expect(JSON.parse(raw as string)).toEqual({
      // 결과가 없는 행은 result: null 로 채운다.
      state: { sessions: [{ id: sessionRow.id, ...sessionRow.data, result: null }] },
      version: 1,
    });
    const meta = JSON.parse(localStorage.getItem("seedbook.sync.rebalancing") as string);
    expect(meta.meta).toMatchObject({ cursor: "c1", versions: { [sessionRow.id]: 2 } });
  });

  it("keeps non-list fields from the local cache", async () => {
    localStorage.setItem(
      "rebalancing-storage",
      JSON.stringify({ state: { sessions: [], expandedFormId: "x" }, version: 1 })
    );
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ cursor: "c1", changes: { rebalancing: [], listOrder: [] } }))
    );
    const storage = (await loadCloudStorage())("rebalancing-storage");

    const raw = await storage.getItem("rebalancing-storage");

    expect(JSON.parse(raw as string).state.expandedFormId).toBe("x");
  });

  it("falls back to the local cache when the pull fails", async () => {
    const cached = JSON.stringify({ state: { sessions: [{ id: "a" }] }, version: 1 });
    localStorage.setItem("rebalancing-storage", cached);
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const storage = (await loadCloudStorage())("rebalancing-storage");

    expect(await storage.getItem("rebalancing-storage")).toBe(cached);
  });

  it("writes only to the local cache — no envelope PUT", async () => {
    vi.useFakeTimers();
    try {
      const storage = (await loadCloudStorage())("rebalancing-storage");

      await storage.setItem("rebalancing-storage", '{"state":{"sessions":[]},"version":1}');
      await vi.advanceTimersByTimeAsync(5_000);

      expect(localStorage.getItem("rebalancing-storage")).toBe(
        '{"state":{"sessions":[]},"version":1}'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("queues a local change as soon as the store persists it, even with no sync engine running", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          cursor: "c1",
          changes: {
            rebalancing: [sessionRow],
            listOrder: [{ domain: "rebalancings", order: [sessionRow.id] }],
          },
        })
      )
    );
    const storage = (await loadCloudStorage())("rebalancing-storage");
    const hydrated = JSON.parse((await storage.getItem("rebalancing-storage")) as string);

    const edited = {
      ...hydrated,
      state: { sessions: [{ ...hydrated.state.sessions[0], accountName: "오프라인 수정" }] },
    };
    await storage.setItem("rebalancing-storage", JSON.stringify(edited));

    const meta = JSON.parse(localStorage.getItem("seedbook.sync.rebalancing") as string).meta;
    expect(meta.outbox[sessionRow.id]).toMatchObject({
      op: "upsert",
      data: { accountName: "오프라인 수정" },
    });
  });

  it("shares one full pull between the stores hydrating on the same page load", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ cursor: "c1", changes: { rebalancing: [], listOrder: [] } }))
    );
    const create = await loadCloudStorage();

    await Promise.all([
      create("rebalancing-storage").getItem("rebalancing-storage"),
      create("rebalancing-storage").getItem("rebalancing-storage"),
    ]);

    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/sync/pull")).toHaveLength(1);
  });

  it("keeps a store without a sync config in this browser only", async () => {
    const storage = (await loadCloudStorage())("unregistered-storage");

    await storage.setItem("unregistered-storage", '{"state":{},"version":1}');
    const value = await storage.getItem("unregistered-storage");

    expect(value).toBe('{"state":{},"version":1}');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
