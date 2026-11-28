import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * cloud 모드에서 자산 store 는 기기 레코드에 두고 동기화 v2 (`/api/sync/v2/*`) 로 서버와 맞춘다.
 * hybrid-storage 는 모드를 모듈 초기화 때 읽으므로 테스트마다 모듈을 새로 불러온다.
 */

const SESSION = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";

const sessionRecord = {
  type: "rebalancing",
  id: SESSION,
  parentId: null,
  version: 2,
  changeSeq: "5",
  deletedAt: null,
  sortKey: "a0",
  fields: {
    accountId: "acc-1",
    accountName: "연금저축",
    portfolioId: "pf-1",
    portfolioName: "안정형",
    cashDelta: 0,
    startedAt: "2026-11-08T00:00:00.000Z",
    completedAt: null,
    result: null,
  },
};

const pullResponse = (records: unknown[]) =>
  new Response(
    JSON.stringify({ protocol: 2, records, cursor: "c1", hasMore: false, reset: false })
  );

async function loadCloudStorage() {
  localStorage.setItem("seedbook.storageMode", "cloud");
  vi.resetModules();
  const { activateAccount } = await import("./account-storage");
  await activateAccount("u1");
  const mod = await import("./hybrid-storage");
  return mod.createHybridStorage;
}

const syncState = () => JSON.parse(localStorage.getItem("seedbook.sync.v2") ?? "null");

describe("hybrid storage for record stores in cloud mode", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("syncs once before the first read and builds the state from the pulled records", async () => {
    fetchMock.mockResolvedValue(pullResponse([sessionRecord]));
    const storage = (await loadCloudStorage())("rebalancing-storage");

    const raw = await storage.getItem("rebalancing-storage");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/sync/v2/pull"),
      expect.objectContaining({
        headers: expect.objectContaining({ "x-seedbook-sync": "2" }),
      })
    );
    expect(JSON.parse(raw as string)).toEqual({
      state: { sessions: [{ id: SESSION, ...sessionRecord.fields, tasks: [] }] },
      version: 0,
    });
    expect(syncState()).toMatchObject({ cursor: "c1" });
  });

  it("reads the device records when the server cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const storage = (await loadCloudStorage())("investment-storage");
    const item = {
      id: ACCOUNT,
      accountName: "연금",
      accountType: "연금",
      currency: "KRW",
      initialInvestment: 0,
      currentValue: 0,
      note: "",
      color: "#000000",
      records: [],
      holdings: [],
      cashItems: [],
    };
    await storage.setItem(
      "investment-storage",
      JSON.stringify({ state: { investments: [item] }, version: 0 })
    );

    const raw = await storage.getItem("investment-storage");

    expect(JSON.parse(raw as string).state.investments).toEqual([item]);
  });

  it("queues a local change as soon as the store persists it, even with no sync engine running", async () => {
    fetchMock.mockResolvedValue(pullResponse([]));
    const storage = (await loadCloudStorage())("investment-storage");
    await storage.getItem("investment-storage");

    await storage.setItem(
      "investment-storage",
      JSON.stringify({
        state: {
          investments: [
            {
              id: ACCOUNT,
              accountName: "연금",
              accountType: "연금",
              currency: "KRW",
              initialInvestment: 0,
              currentValue: Number.NaN,
              color: "#000000",
            },
          ],
        },
        version: 0,
      })
    );

    expect(syncState().outbox[`account:${ACCOUNT}`]).toMatchObject({
      op: "create",
      // NaN 은 저장 전에 0 으로 정리된다.
      fields: expect.objectContaining({ accountName: "연금", currentValue: 0 }),
    });
  });
});
