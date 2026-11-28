import { describe, expect, it } from "vitest";
import { GARDEN_SPACING_X, gardenLayout, spotsTallestToBack } from "./garden-layout";

describe("gardenLayout", () => {
  it("returns no spots for an empty garden", () => {
    expect(gardenLayout(0)).toEqual({ spots: [], width: 0, depth: 0 });
  });

  it("centers a single plant", () => {
    expect(gardenLayout(1).spots).toEqual([{ x: 0, z: 0 }]);
  });

  it("puts three plants in one centered row", () => {
    const layout = gardenLayout(3);
    expect(layout.spots.map((s) => s.z)).toEqual([0, 0, 0]);
    expect(layout.spots.map((s) => s.x)).toEqual([-GARDEN_SPACING_X, 0, GARDEN_SPACING_X]);
    expect(layout.depth).toBe(0);
  });

  it("splits eight plants into two rows of four", () => {
    const layout = gardenLayout(8);
    const rows = new Set(layout.spots.map((s) => s.z));
    expect(rows.size).toBe(2);
    expect(layout.spots.filter((s) => s.z < 0)).toHaveLength(4);
  });

  it("staggers the back row so plants do not hide each other", () => {
    const layout = gardenLayout(8);
    const backXs = layout.spots.filter((s) => s.z < 0).map((s) => s.x);
    const frontXs = layout.spots.filter((s) => s.z > 0).map((s) => s.x);
    for (const x of backXs) expect(frontXs).not.toContain(x);
  });

  it("never places two plants on the same spot", () => {
    for (const count of [1, 2, 3, 5, 8, 12]) {
      const keys = gardenLayout(count).spots.map((s) => `${s.x},${s.z}`);
      expect(new Set(keys).size).toBe(count);
    }
  });
});

describe("spotsTallestToBack", () => {
  it("keeps the order when there is a single row", () => {
    expect(spotsTallestToBack([0, 4, 2])).toEqual([0, 1, 2]);
  });

  it("puts the tallest plants on the back row", () => {
    // 5그루 = 뒷줄 3 (spot 0~2) + 앞줄 2 (spot 3~4).
    const spotOf = spotsTallestToBack([2, 1, 0, 3, 4]);
    const back = new Set([0, 1, 2]);

    expect(back.has(spotOf[4] ?? -1)).toBe(true);
    expect(back.has(spotOf[3] ?? -1)).toBe(true);
    expect(back.has(spotOf[0] ?? -1)).toBe(true);
    expect(back.has(spotOf[2] ?? -1)).toBe(false);
  });

  it("keeps the list order among plants of the same height", () => {
    expect(spotsTallestToBack([1, 1, 1, 1, 1])).toEqual([0, 1, 2, 3, 4]);
  });

  it("gives every plant its own spot", () => {
    const spotOf = spotsTallestToBack([3, 0, 4, 1, 2, 0, 4, 3]);
    expect(new Set(spotOf).size).toBe(8);
  });
});
