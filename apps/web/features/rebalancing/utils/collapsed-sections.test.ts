import { describe, expect, it } from "vitest";
import { parseCollapsedSections, toggleCollapsedSection } from "./collapsed-sections";

describe("parseCollapsedSections", () => {
  it("keeps known sections", () => {
    expect(parseCollapsedSections(["filled", "ordered"])).toEqual(["filled", "ordered"]);
  });

  it("drops unknown sections and duplicates (e.g. from an old cache)", () => {
    expect(parseCollapsedSections(["filled", "done", "filled"])).toEqual(["filled"]);
  });

  it("is null for a value that is not a list", () => {
    expect(parseCollapsedSections("filled")).toBeNull();
  });
});

describe("toggleCollapsedSection", () => {
  it("collapses an expanded section", () => {
    expect(toggleCollapsedSection([], "filled")).toEqual(["filled"]);
  });

  it("expands a collapsed section", () => {
    expect(toggleCollapsedSection(["pending", "filled"], "filled")).toEqual(["pending"]);
  });
});
