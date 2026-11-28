import { describe, expect, it } from "vitest";
import { DEFAULT_PLANT_OPTIONS, type PlantStage } from "./plant-options";
import { grewAtSlot, type PlantSlot } from "./plant-renderer";

const slot = (id: string, stage: PlantStage, extra: Partial<PlantSlot["options"]> = {}) => ({
  id,
  x: 0,
  z: 0,
  options: { ...DEFAULT_PLANT_OPTIONS, stage, ...extra },
});

describe("grewAtSlot", () => {
  it("is false for a newly placed plant", () => {
    expect(grewAtSlot(undefined, slot("a", "sprout"))).toBe(false);
  });

  it("is true when the same plant moved up a stage", () => {
    expect(grewAtSlot(slot("a", "sprout"), slot("a", "sapling"))).toBe(true);
  });

  it("is false when only wind, wilt, ripeness or rebalancing changed", () => {
    const after = slot("a", "tree", { wind: 0.5, wilt: 0.7, ripe: true, needsRebalance: true });

    expect(grewAtSlot(slot("a", "tree"), after)).toBe(false);
  });

  it("is false when another plant takes the spot (a portfolio was removed)", () => {
    expect(grewAtSlot(slot("a", "seed"), slot("b", "tree"))).toBe(false);
  });
});
