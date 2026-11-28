import type { HarvestItem } from "@mobile/features/portfolio/utils/plant-season";
import { describe, expect, it } from "vitest";
import { basketCards } from "./basket";

function harvest(partial: Partial<HarvestItem> = {}): HarvestItem {
  return {
    id: "h1",
    sourceType: "portfolio",
    sourceId: "p1",
    sourceName: "안정형",
    season: 1,
    plantKind: "tree",
    wish: "부모님과 제주 여행",
    plantName: "",
    wishHistory: [],
    goals: [
      { amount: 10_000_000, reachedAt: "2026-01-05T03:00:00.000Z" },
      { amount: 11_000_000, reachedAt: "2026-03-05T03:00:00.000Z" },
      { amount: 12_100_000, reachedAt: "2026-05-05T03:00:00.000Z" },
      { amount: 13_310_000, reachedAt: "2026-07-05T03:00:00.000Z" },
      { amount: 14_650_000, reachedAt: "2026-11-27T16:00:00.000Z" },
    ],
    harvestedAt: "2026-11-27T16:00:00.000Z",
    doneAt: null,
    ...partial,
  };
}

describe("basketCards", () => {
  it("is empty without harvests", () => {
    expect(basketCards([])).toEqual([]);
  });

  it("describes a harvest: wish, season, the time it took and the goals", () => {
    expect(basketCards([harvest()])).toEqual([
      {
        id: "h1",
        kind: "tree",
        wish: "부모님과 제주 여행",
        source: "안정형",
        period: "2026.01.05 ~ 2026.11.28",
        goals: ["1,000만원", "1,100만원", "1,210만원", "1,331만원", "1,465만원"],
        doneOn: null,
      },
    ]);
  });

  it("names the portfolio only, without counting harvests", () => {
    expect(basketCards([harvest({ season: 3 })])[0]?.source).toBe("안정형");
  });

  it("names the plant before the portfolio", () => {
    expect(basketCards([harvest({ plantName: "몽글이" })])[0]?.source).toBe("몽글이 · 안정형");
  });

  it("names a harvest without a wish", () => {
    expect(basketCards([harvest({ wish: "" })])[0]?.wish).toBe("하고 싶은 일 없이 수확했어요");
  });

  it("shows the day the wish was done (KST)", () => {
    expect(basketCards([harvest({ doneAt: "2026-12-24T15:30:00.000Z" })])[0]?.doneOn).toBe(
      "2026.12.25"
    );
  });

  it("lists the latest harvest first", () => {
    const older = harvest({ id: "old", harvestedAt: "2026-06-01T00:00:00.000Z" });
    const newer = harvest({ id: "new", harvestedAt: "2026-11-01T00:00:00.000Z" });

    expect(basketCards([older, newer]).map((card) => card.id)).toEqual(["new", "old"]);
  });
});
