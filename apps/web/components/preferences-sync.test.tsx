import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { activateAccount } from "@web/lib/account-storage";
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

beforeEach(async () => {
  await activateAccount("u1");
});

describe("PreferencesSync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePreferencesStore.setState({
      rebalancingTaskSort: "nameDesc",
      rebalancingCollapsedSections: [],
      accountSortOption: "evalDesc",
      portfolioStockSortOption: "driftDesc",
      investmentTrendRange: "3months" as never,
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

  it("applies the account's list sorts and chart range on login", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            accountSortOption: "evalAsc",
            portfolioStockSortOption: "nameAsc",
            investmentTrendRange: "1year",
          }),
          { status: 200 }
        )
    );

    render(<PreferencesSync />);

    await waitFor(() =>
      expect(usePreferencesStore.getState()).toMatchObject({
        accountSortOption: "evalAsc",
        portfolioStockSortOption: "nameAsc",
        investmentTrendRange: "1year",
      })
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
