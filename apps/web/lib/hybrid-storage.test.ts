import { useSyncStatusStore } from "@web/features/settings/stores/sync-status-store";
import { __resetAccountForTests, activateAccount } from "@web/lib/account-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHybridStorage } from "./hybrid-storage";
import { STORAGE_MODE_KEY, setStorageMode } from "./storage-mode";

beforeEach(async () => {
  __resetAccountForTests();
  await activateAccount("u");
});

/**
 * 하이브리드 스토리지 어댑터는 두 가지 모드를 지원한다:
 *   - 자산 store: 모드와 상관없이 기기 레코드 (`lib/sync/v2`), cloud 면 outbox 에도 기록
 *     (hybrid-storage.sync-managed.test.ts)
 *   - 그 밖의 store: 기기 저장소의 envelope 그대로
 *
 * 주의: 모드는 모듈 초기화 시점에 한 번 고정된다. 이 테스트 파일은 모듈이 이미
 * 로드된 상태에서 실행되므로 `mode === "local"` 에 고정되어 있다. cloud 모드
 * 동작은 별도 파일에서 모듈을 리셋한 뒤 import 해야 정확히 검증되며, 여기서는
 * 로컬 모드의 동기 왕복과 공용 유틸만 다룬다.
 */

describe("createHybridStorage (local mode)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  const ACCOUNT = "11111111-1111-4111-8111-111111111111";
  const account = (extra: Record<string, unknown> = {}) => ({
    id: ACCOUNT,
    accountName: "연금",
    accountType: "연금",
    currency: "KRW",
    initialInvestment: 0,
    currentValue: 1_000,
    note: "",
    color: "#000000",
    sellCostPercent: 0,
    records: [],
    holdings: [],
    cashItems: [],
    ...extra,
  });
  const envelope = (item: Record<string, unknown>) =>
    JSON.stringify({ state: { investments: [item] }, version: 6 });

  it("local 모드에서 자산 store 를 기기 레코드로 저장하고 다시 읽는다", async () => {
    const storage = createHybridStorage("investment-storage");
    await storage.setItem("investment-storage", envelope(account()));

    const loaded = JSON.parse((await storage.getItem("investment-storage")) as string);
    expect(loaded).toEqual({ state: { investments: [account()] }, version: 6 });
    expect(window.localStorage.getItem("seedbook.records")).toContain(ACCOUNT);
  });

  it("local 모드에서 저장 전에 NaN 금액을 0 으로 정리한다", async () => {
    const storage = createHybridStorage("investment-storage");
    // persist 는 메모리의 NaN 을 JSON null 로 직렬화한다.
    await storage.setItem("investment-storage", envelope(account({ currentValue: null })));

    const loaded = JSON.parse((await storage.getItem("investment-storage")) as string);
    expect(loaded.state.investments[0].currentValue).toBe(0);
  });

  it("local 모드에서 옛 envelope 를 처음 읽을 때 레코드로 옮기고 NaN 금액은 0 으로 정리한다", async () => {
    window.localStorage.setItem("investment-storage", envelope(account({ currentValue: null })));
    const storage = createHybridStorage("investment-storage");

    const loaded = JSON.parse((await storage.getItem("investment-storage")) as string);
    expect(loaded.state.investments[0].currentValue).toBe(0);
    expect(window.localStorage.getItem("seedbook.records")).toContain(ACCOUNT);
  });

  it("local 모드에서 removeItem 이 localStorage 에서 key 를 제거한다", () => {
    const storage = createHybridStorage("savings-storage");
    storage.setItem("savings-storage", '{"state":{}}');
    storage.removeItem("savings-storage");
    expect(window.localStorage.getItem("savings-storage")).toBeNull();
  });

  it("local 모드에서 getItem 결과가 null 일 수 있다 (빈 localStorage)", () => {
    const storage = createHybridStorage("progress-storage");
    expect(storage.getItem("progress-storage")).toBeNull();
  });
});

describe("setStorageMode / getStorageMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("기본값은 local", async () => {
    const { getStorageMode } = await import("./storage-mode");
    expect(getStorageMode()).toBe("local");
  });

  it("cloud 로 설정하면 localStorage 에 기록된다", async () => {
    setStorageMode("cloud");
    expect(window.localStorage.getItem(STORAGE_MODE_KEY)).toBe("cloud");
  });

  it("local 로 되돌리면 localStorage 에 local 로 기록된다", async () => {
    setStorageMode("cloud");
    setStorageMode("local");
    expect(window.localStorage.getItem(STORAGE_MODE_KEY)).toBe("local");
  });
});

describe("pushStorageModeToServer", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PUT /api/me/storage-mode 로 mode 를 보낸다", async () => {
    const { pushStorageModeToServer } = await import("./storage-mode");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await pushStorageModeToServer("cloud");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/me/storage-mode");
    expect((init as RequestInit | undefined)?.method).toBe("PUT");
    expect((init as RequestInit | undefined)?.body).toBe(JSON.stringify({ storageMode: "cloud" }));
  });

  it("네트워크 실패는 throw 하지 않고 silent (다음 sync 가 따라잡음)", async () => {
    const { pushStorageModeToServer } = await import("./storage-mode");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(pushStorageModeToServer("cloud")).resolves.toBeUndefined();
  });
});

describe("useSyncStatusStore", () => {
  beforeEach(() => {
    useSyncStatusStore.setState({
      state: "idle",
      lastSyncedAt: null,
      pendingKeys: new Set(),
      lastError: null,
    });
  });

  it("markSaving 은 key 를 pending 에 추가하고 상태를 saving 으로 바꾼다", () => {
    useSyncStatusStore.getState().markSaving("investment-storage");
    const state = useSyncStatusStore.getState();
    expect(state.state).toBe("saving");
    expect(state.pendingKeys.has("investment-storage")).toBe(true);
  });

  it("markSaved 는 pending 이 비면 idle 로 돌아간다", () => {
    useSyncStatusStore.getState().markSaving("savings-storage");
    useSyncStatusStore.getState().markSaved("savings-storage");
    const state = useSyncStatusStore.getState();
    expect(state.state).toBe("idle");
    expect(state.pendingKeys.size).toBe(0);
    expect(state.lastSyncedAt).not.toBeNull();
  });

  it("markSaved 는 pending 이 남아 있으면 saving 을 유지한다", () => {
    useSyncStatusStore.getState().markSaving("a");
    useSyncStatusStore.getState().markSaving("b");
    useSyncStatusStore.getState().markSaved("a");
    expect(useSyncStatusStore.getState().state).toBe("saving");
    expect(useSyncStatusStore.getState().pendingKeys.has("b")).toBe(true);
  });

  it("markError 는 state=error + lastError 를 설정한다", () => {
    useSyncStatusStore.getState().markError("debts-storage", "PUT 500");
    const state = useSyncStatusStore.getState();
    expect(state.state).toBe("error");
    expect(state.lastError).toBe("PUT 500");
  });

  it("markUnauthenticated 는 state=unauthenticated 로 바꾼다", () => {
    useSyncStatusStore.getState().markUnauthenticated();
    expect(useSyncStatusStore.getState().state).toBe("unauthenticated");
  });
});
