import { DEFAULT_ACCOUNT_PREFERENCES } from "@web/features/settings/utils/account-preferences";
import { activateAccount } from "@web/lib/account-storage";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferencesStore } from "./preferences-store";

const DEFAULTS = {
  rebalancingTaskSort: "nameDesc",
  rebalancingCollapsedSections: [],
  accountSortOption: "evalDesc",
  portfolioStockSortOption: "driftDesc",
  investmentTrendRange: "3months",
  holdingsSortOption: "evalDesc",
} as const;

describe("preferences store", () => {
  beforeEach(() => {
    usePreferencesStore.setState(DEFAULT_ACCOUNT_PREFERENCES);
  });

  it("starts with each screen's default", () => {
    const {
      rebalancingTaskSort,
      rebalancingCollapsedSections,
      accountSortOption,
      portfolioStockSortOption,
      investmentTrendRange,
      holdingsSortOption,
    } = usePreferencesStore.getState();

    expect({
      rebalancingTaskSort,
      rebalancingCollapsedSections,
      accountSortOption,
      portfolioStockSortOption,
      investmentTrendRange,
      holdingsSortOption,
    }).toEqual(DEFAULTS);
  });

  it("updates the rebalancing trade sort", () => {
    usePreferencesStore.getState().applyPreferences({ rebalancingTaskSort: "evalDesc" });

    expect(usePreferencesStore.getState().rebalancingTaskSort).toBe("evalDesc");
  });

  it("updates the account list sort", () => {
    usePreferencesStore.getState().applyPreferences({ accountSortOption: "evalAsc" });

    expect(usePreferencesStore.getState().accountSortOption).toBe("evalAsc");
  });

  it("updates the portfolio stock sort", () => {
    usePreferencesStore.getState().applyPreferences({ portfolioStockSortOption: "nameAsc" });

    expect(usePreferencesStore.getState().portfolioStockSortOption).toBe("nameAsc");
  });

  it("updates the holdings sort", () => {
    usePreferencesStore.getState().applyPreferences({ holdingsSortOption: "priceAsc" });

    expect(usePreferencesStore.getState().holdingsSortOption).toBe("priceAsc");
  });

  it("updates the investment trend range", () => {
    usePreferencesStore.getState().applyPreferences({ investmentTrendRange: "1year" });

    expect(usePreferencesStore.getState().investmentTrendRange).toBe("1year");
  });

  it("ignores values that are not an option (e.g. a removed one from an old cache)", () => {
    usePreferencesStore
      .getState()
      .applyPreferences({ rebalancingTaskSort: "default", accountSortOption: "default" });

    expect(usePreferencesStore.getState()).toMatchObject({
      rebalancingTaskSort: "nameDesc",
      accountSortOption: "evalDesc",
    });
  });

  it("updates the collapsed rebalancing sections, dropping unknown ones", () => {
    usePreferencesStore
      .getState()
      .applyPreferences({ rebalancingCollapsedSections: ["filled", "done"] });

    expect(usePreferencesStore.getState().rebalancingCollapsedSections).toEqual(["filled"]);
  });

  it("restores every saved preference from this device after a reload", async () => {
    window.localStorage.clear();
    await activateAccount("u1");
    // 앞 세션이 남긴 캐시 (u1 이 이 기기의 첫 계정이라 원래 키를 쓴다).
    window.localStorage.setItem(
      "seedbook.preferences",
      JSON.stringify({
        state: {
          accountSortOption: "evalAsc",
          portfolioStockSortOption: "nameDesc",
          investmentTrendRange: "all",
          rebalancingTaskSort: "evalAsc",
        },
        version: 1,
      })
    );

    await usePreferencesStore.persist.rehydrate();

    expect(usePreferencesStore.getState()).toMatchObject({
      accountSortOption: "evalAsc",
      portfolioStockSortOption: "nameDesc",
      investmentTrendRange: "all",
      rebalancingTaskSort: "evalAsc",
    });
  });
});
