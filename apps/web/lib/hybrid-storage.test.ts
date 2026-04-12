import { useSyncStatusStore } from "@web/features/settings/stores/sync-status-store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetHybridStorageForTests, createHybridStorage } from "./hybrid-storage";
import { setStorageMode, STORAGE_MODE_KEY } from "./storage-mode";

/**
 * 하이브리드 스토리지 어댑터는 두 가지 모드를 지원한다:
 *   - local: localStorage 에 직접 delegate
 *   - cloud: /api/storage/[key] 에 네트워크 왕복 + localStorage 캐시
 *
 * 주의: 모드는 모듈 초기화 시점에 한 번 고정된다. 이 테스트 파일은 모듈이 이미
 * 로드된 상태에서 실행되므로 `mode === "local"` 에 고정되어 있다. cloud 모드
 * 동작은 별도 파일에서 모듈을 리셋한 뒤 import 해야 정확히 검증되며, 여기서는
 * 로컬 모드의 동기 왕복과 공용 유틸만 다룬다.
 */

describe("createHybridStorage (local mode)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetHybridStorageForTests();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("local 모드에서 setItem / getItem 이 localStorage 를 round-trip 한다", () => {
    const storage = createHybridStorage("investment-storage");
    storage.setItem("investment-storage", '{"state":{}}');
    const result = storage.getItem("investment-storage");
    expect(result).toBe('{"state":{}}');
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
