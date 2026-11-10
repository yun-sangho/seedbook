import { describe, expect, it } from "vitest";
import type { PortfolioItem } from "../types/types";
import {
  accountPortfolioMap,
  dedupePortfolioLinks,
  otherLinkedPortfolio,
  sortLinkedElsewhereLast,
} from "./portfolio-links";

function portfolio(partial: Partial<PortfolioItem> & Pick<PortfolioItem, "id">): PortfolioItem {
  return {
    name: partial.id,
    color: "#111",
    allocations: [],
    accountIds: [],
    driftMode: "absolute",
    driftThresholdPercent: 5,
    note: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("dedupePortfolioLinks", () => {
  it("returns portfolios unchanged when no account is linked twice", () => {
    const input = [
      portfolio({ id: "p1", accountIds: ["a"] }),
      portfolio({ id: "p2", accountIds: ["b"] }),
    ];

    const result = dedupePortfolioLinks(input);

    expect(result.map((p) => p.accountIds)).toEqual([["a"], ["b"]]);
  });

  it("keeps a shared account only in the most recently updated portfolio", () => {
    const input = [
      portfolio({ id: "old", accountIds: ["a", "b"], updatedAt: "2026-01-01T00:00:00.000Z" }),
      portfolio({ id: "new", accountIds: ["a"], updatedAt: "2026-03-01T00:00:00.000Z" }),
    ];

    const result = dedupePortfolioLinks(input);

    expect(result.find((p) => p.id === "old")!.accountIds).toEqual(["b"]);
    expect(result.find((p) => p.id === "new")!.accountIds).toEqual(["a"]);
  });

  it("breaks updatedAt ties by keeping the earlier portfolio in list order", () => {
    const input = [
      portfolio({ id: "first", accountIds: ["a"] }),
      portfolio({ id: "second", accountIds: ["a"] }),
    ];

    const result = dedupePortfolioLinks(input);

    expect(result.map((p) => p.accountIds)).toEqual([["a"], []]);
  });

  it("treats a missing updatedAt as older than any timestamp", () => {
    const input = [
      portfolio({ id: "blank", accountIds: ["a"], updatedAt: "" }),
      portfolio({ id: "dated", accountIds: ["a"] }),
    ];

    const result = dedupePortfolioLinks(input);

    expect(result.map((p) => p.accountIds)).toEqual([[], ["a"]]);
  });

  it("removes repeated ids within the same portfolio", () => {
    const result = dedupePortfolioLinks([portfolio({ id: "p", accountIds: ["a", "a", "b"] })]);

    expect(result[0]!.accountIds).toEqual(["a", "b"]);
  });

  it("does not touch updatedAt of the portfolios it trims", () => {
    const input = [
      portfolio({ id: "old", accountIds: ["a"], updatedAt: "2026-01-01T00:00:00.000Z" }),
      portfolio({ id: "new", accountIds: ["a"], updatedAt: "2026-03-01T00:00:00.000Z" }),
    ];

    const result = dedupePortfolioLinks(input);

    expect(result.map((p) => p.updatedAt)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
    ]);
  });

  it("preserves portfolio order", () => {
    const input = [portfolio({ id: "x" }), portfolio({ id: "y" }), portfolio({ id: "z" })];

    expect(dedupePortfolioLinks(input).map((p) => p.id)).toEqual(["x", "y", "z"]);
  });
});

describe("accountPortfolioMap", () => {
  it("maps each linked account id to its portfolio", () => {
    const p1 = portfolio({ id: "p1", accountIds: ["a", "b"] });
    const p2 = portfolio({ id: "p2", accountIds: ["c"] });

    const map = accountPortfolioMap([p1, p2]);

    expect(map.get("a")?.id).toBe("p1");
    expect(map.get("b")?.id).toBe("p1");
    expect(map.get("c")?.id).toBe("p2");
    expect(map.has("d")).toBe(false);
  });
});

describe("otherLinkedPortfolio", () => {
  const p1 = portfolio({ id: "p1", accountIds: ["a"] });
  const p2 = portfolio({ id: "p2", accountIds: ["b"] });
  const map = accountPortfolioMap([p1, p2]);

  it("returns the other portfolio the account is linked to", () => {
    expect(otherLinkedPortfolio(map, "b", "p1")?.id).toBe("p2");
  });

  it("returns undefined when the account is linked to the current portfolio", () => {
    expect(otherLinkedPortfolio(map, "a", "p1")).toBeUndefined();
  });

  it("returns undefined when the account is not linked anywhere", () => {
    expect(otherLinkedPortfolio(map, "c", "p1")).toBeUndefined();
  });
});

describe("sortLinkedElsewhereLast", () => {
  it("moves accounts linked to other portfolios to the end, keeping the order within each group", () => {
    const map = accountPortfolioMap([
      portfolio({ id: "current", accountIds: ["b"] }),
      portfolio({ id: "other", accountIds: ["a", "c"] }),
    ]);
    const accounts = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

    const result = sortLinkedElsewhereLast(accounts, map, "current");

    expect(result.map((a) => a.id)).toEqual(["b", "d", "a", "c"]);
  });
});
