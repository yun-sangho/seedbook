import { describe, expect, it } from "vitest";
import { GARDEN_SPACING_X, gardenLayout } from "./garden-layout";

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
