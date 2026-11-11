import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { usePreferencesStore } from "@web/lib/preferences-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesSync } from "./preferences-sync";

const mockUseSession = vi.fn();
vi.mock("@web/lib/auth-client", () => ({ useSession: () => mockUseSession() }));

function serverSort(sort: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify({ rebalancingTaskSort: sort }), { status: 200 })
  );
}

describe("PreferencesSync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePreferencesStore.setState({
      rebalancingTaskSort: "nameDesc",
      rebalancingCollapsedSections: [],
    });
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies the account's sort on login", async () => {
    serverSort("evalDesc");

    render(<PreferencesSync />);

    await waitFor(() =>
      expect(usePreferencesStore.getState().rebalancingTaskSort).toBe("evalDesc")
    );
  });

  it("applies the account's collapsed rebalancing sections on login", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            rebalancingTaskSort: "nameDesc",
            rebalancingCollapsedSections: ["filled"],
          }),
          { status: 200 }
        )
    );

    render(<PreferencesSync />);

    await waitFor(() =>
      expect(usePreferencesStore.getState().rebalancingCollapsedSections).toEqual(["filled"])
    );
  });

  it("still applies it when effects run twice (React StrictMode in development)", async () => {
    serverSort("evalAsc");

    render(
      <StrictMode>
        <PreferencesSync />
      </StrictMode>
    );

    await waitFor(() => expect(usePreferencesStore.getState().rebalancingTaskSort).toBe("evalAsc"));
  });

  it("does nothing while logged out", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    render(<PreferencesSync />);

    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(usePreferencesStore.getState().rebalancingTaskSort).toBe("nameDesc");
  });
});
