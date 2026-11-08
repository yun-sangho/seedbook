import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * cloud 모드에서 엔티티 동기화가 관리하는 store (`debts-storage`) 는 envelope
 * (`/api/storage`) 를 쓰지 않는다. hybrid-storage 는 모드를 모듈 초기화 때 읽으므로
 * 테스트마다 모듈을 새로 불러온다.
 */

const debtRow = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 2,
  deletedAt: null,
  data: {
    loanName: "전세대출",
    loanType: "전세",
    lender: "은행",
    amount: 100,
    interestRate: 4,
    maturityDate: "",
    monthlyPayment: 1,
    note: "",
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
          changes: { debt: [debtRow], listOrder: [{ domain: "debts", order: [debtRow.id] }] },
        })
      )
    );
    const storage = (await loadCloudStorage())("debts-storage");

    const raw = await storage.getItem("debts-storage");

    expect(fetchMock).toHaveBeenCalledWith("/api/sync/pull", expect.anything());
    expect(JSON.parse(raw as string)).toEqual({
      state: { debts: [{ id: debtRow.id, ...debtRow.data }] },
      version: 3,
    });
    const meta = JSON.parse(localStorage.getItem("seedbook.sync.debt") as string);
    expect(meta.meta).toMatchObject({ cursor: "c1", versions: { [debtRow.id]: 2 } });
  });

  it("keeps non-list fields from the local cache", async () => {
    localStorage.setItem(
      "debts-storage",
      JSON.stringify({ state: { debts: [], expandedFormId: "x" }, version: 3 })
    );
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ cursor: "c1", changes: { debt: [], listOrder: [] } }))
    );
    const storage = (await loadCloudStorage())("debts-storage");

    const raw = await storage.getItem("debts-storage");

    expect(JSON.parse(raw as string).state.expandedFormId).toBe("x");
  });

  it("falls back to the local cache when the pull fails", async () => {
    const cached = JSON.stringify({ state: { debts: [{ id: "a" }] }, version: 3 });
    localStorage.setItem("debts-storage", cached);
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const storage = (await loadCloudStorage())("debts-storage");

    expect(await storage.getItem("debts-storage")).toBe(cached);
  });

  it("writes only to the local cache — no envelope PUT", async () => {
    vi.useFakeTimers();
    try {
      const storage = (await loadCloudStorage())("debts-storage");

      await storage.setItem("debts-storage", '{"state":{"debts":[]},"version":3}');
      await vi.advanceTimersByTimeAsync(5_000);

      expect(localStorage.getItem("debts-storage")).toBe('{"state":{"debts":[]},"version":3}');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still uses the envelope API for stores that are not sync-managed", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: null })));
    const storage = (await loadCloudStorage())("savings-storage");

    await storage.getItem("savings-storage");

    expect(fetchMock).toHaveBeenCalledWith("/api/storage/savings-storage", expect.anything());
  });
});
