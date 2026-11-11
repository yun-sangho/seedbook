import { beforeEach, describe, expect, it } from "vitest";
import { usePreferencesStore } from "./preferences-store";

describe("preferences store", () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      rebalancingTaskSort: "nameDesc",
      rebalancingCollapsedSections: [],
    });
  });

  it("defaults the rebalancing trade sort to name descending", () => {
    expect(usePreferencesStore.getState().rebalancingTaskSort).toBe("nameDesc");
  });

  it("updates the rebalancing trade sort", () => {
    usePreferencesStore.getState().setRebalancingTaskSort("evalDesc");

    expect(usePreferencesStore.getState().rebalancingTaskSort).toBe("evalDesc");
  });

  it("ignores a value that is not a sort option (e.g. a removed one from an old cache)", () => {
    usePreferencesStore.getState().setRebalancingTaskSort("default" as never);

    expect(usePreferencesStore.getState().rebalancingTaskSort).toBe("nameDesc");
  });

  it("starts with every rebalancing section expanded", () => {
    expect(usePreferencesStore.getState().rebalancingCollapsedSections).toEqual([]);
  });

  it("updates the collapsed rebalancing sections, dropping unknown ones", () => {
    usePreferencesStore.getState().setRebalancingCollapsedSections(["filled", "done" as never]);

    expect(usePreferencesStore.getState().rebalancingCollapsedSections).toEqual(["filled"]);
  });
});
