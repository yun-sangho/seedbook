import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_MODE_KEY } from "@web/lib/storage-mode";

const mockUseSession = vi.fn();

vi.mock("@web/lib/auth-client", () => ({
  useSession: () => mockUseSession(),
}));

import { StorageModeSync } from "./storage-mode-sync";

/**
 * StorageModeSync 는 로그인된 사용자 한 명에 대해 한 번만 서버 preference 를
 * 조회하고, 서버 mode 와 localStorage 가 다르면 localStorage 를 덮어쓰고
 * `window.location.reload()` 를 호출한다.
 */
describe("StorageModeSync", () => {
  beforeEach(() => {
    mockUseSession.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubLocationReload() {
    const reload = vi.fn();
    const locationStub = { reload, href: "" } as unknown as Location;
    vi.stubGlobal("location", locationStub);
    return reload;
  }

  it("isPending 이면 fetch 하지 않는다", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<StorageModeSync />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("세션이 없으면 fetch 하지 않는다", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<StorageModeSync />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("서버 mode == local mode 이면 reload 안 함", async () => {
    window.localStorage.setItem(STORAGE_MODE_KEY, "cloud");
    mockUseSession.mockReturnValue({ data: { user: { id: "u-1" } }, isPending: false });
    const reload = stubLocationReload();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ storageMode: "cloud" }), { status: 200 }),
      );

    render(<StorageModeSync />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(reload).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_MODE_KEY)).toBe("cloud");
  });

  it("서버가 cloud, 로컬이 local 이면 localStorage 덮어쓰고 reload", async () => {
    window.localStorage.setItem(STORAGE_MODE_KEY, "local");
    mockUseSession.mockReturnValue({ data: { user: { id: "u-1" } }, isPending: false });
    const reload = stubLocationReload();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ storageMode: "cloud" }), { status: 200 }),
    );

    render(<StorageModeSync />);
    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_MODE_KEY)).toBe("cloud");
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it("같은 userId 로 재렌더해도 두 번 fetch 하지 않는다", async () => {
    window.localStorage.setItem(STORAGE_MODE_KEY, "cloud");
    mockUseSession.mockReturnValue({ data: { user: { id: "u-1" } }, isPending: false });
    stubLocationReload();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ storageMode: "cloud" }), { status: 200 }),
      );

    const { rerender } = render(<StorageModeSync />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    rerender(<StorageModeSync />);
    rerender(<StorageModeSync />);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("HTTP 실패 시 silent — reload 안 함", async () => {
    window.localStorage.setItem(STORAGE_MODE_KEY, "local");
    mockUseSession.mockReturnValue({ data: { user: { id: "u-1" } }, isPending: false });
    const reload = stubLocationReload();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("server error", { status: 500 }));

    render(<StorageModeSync />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_MODE_KEY)).toBe("local");
  });

  it("이상한 storageMode 값은 'local' 로 받아들인다 (회귀 방지)", async () => {
    window.localStorage.setItem(STORAGE_MODE_KEY, "cloud");
    mockUseSession.mockReturnValue({ data: { user: { id: "u-1" } }, isPending: false });
    const reload = stubLocationReload();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ storageMode: "weird" }), { status: 200 }),
    );

    render(<StorageModeSync />);
    await waitFor(() => {
      // 서버의 'weird' → local 로 정규화 → 로컬 'cloud' 와 다르므로 sync.
      expect(window.localStorage.getItem(STORAGE_MODE_KEY)).toBe("local");
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});
