import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCOUNT_PREFERENCES,
  invalidPreferenceKeys,
  parseAccountPreferences,
} from "./account-preferences";

describe("parseAccountPreferences", () => {
  it("keeps every recognised preference", () => {
    const prefs = {
      rebalancingTaskSort: "evalAsc",
      rebalancingCollapsedSections: ["filled"],
      accountSortOption: "evalAsc",
      portfolioStockSortOption: "nameAsc",
      investmentTrendRange: "1year",
      holdingsSortOption: "priceAsc",
    };

    expect(parseAccountPreferences(prefs)).toEqual(prefs);
  });

  it("drops values that are not an option (removed options in an old cache or server row)", () => {
    expect(
      parseAccountPreferences({
        accountSortOption: "default",
        portfolioStockSortOption: "priceDesc",
        investmentTrendRange: "2years",
        rebalancingTaskSort: 3,
        holdingsSortOption: "default",
      })
    ).toEqual({});
  });

  it("drops unknown keys", () => {
    expect(
      parseAccountPreferences({ storageMode: "cloud", accountSortOption: "evalDesc" })
    ).toEqual({ accountSortOption: "evalDesc" });
  });

  it("drops unknown collapsed sections but keeps the list", () => {
    expect(parseAccountPreferences({ rebalancingCollapsedSections: ["filled", "done"] })).toEqual({
      rebalancingCollapsedSections: ["filled"],
    });
  });

  it("returns nothing for a value that is not an object", () => {
    expect(parseAccountPreferences(null)).toEqual({});
    expect(parseAccountPreferences("evalDesc")).toEqual({});
  });
});

describe("invalidPreferenceKeys", () => {
  it("names the preferences that were sent with a value that is not an option", () => {
    expect(
      invalidPreferenceKeys({
        accountSortOption: "evalAsc",
        portfolioStockSortOption: "nope",
        investmentTrendRange: null,
      })
    ).toEqual(["portfolioStockSortOption", "investmentTrendRange"]);
  });

  it("accepts a collapsed-section list with unknown names (they are dropped, not rejected)", () => {
    expect(invalidPreferenceKeys({ rebalancingCollapsedSections: ["done"] })).toEqual([]);
  });
});

describe("DEFAULT_ACCOUNT_PREFERENCES", () => {
  it("matches each screen's default", () => {
    expect(DEFAULT_ACCOUNT_PREFERENCES).toEqual({
      rebalancingTaskSort: "nameDesc",
      rebalancingCollapsedSections: [],
      accountSortOption: "evalDesc",
      portfolioStockSortOption: "driftDesc",
      investmentTrendRange: "3months",
      holdingsSortOption: "evalDesc",
    });
  });
});
