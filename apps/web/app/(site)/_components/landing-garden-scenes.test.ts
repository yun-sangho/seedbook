import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_GARDEN_PLANTS, landingGardenSlots, shouldLoad3d } from "./landing-garden-scenes";

const PUBLIC_LANDING = join(__dirname, "../../../public/landing");
const READY = { reducedMotion: false, saveData: false, webgl: true };

describe("shouldLoad3d", () => {
  it("loads the 3D garden when WebGL works and the user has no motion or data limits", () => {
    expect(shouldLoad3d(READY)).toBe(true);
  });

  it("keeps the still image without WebGL", () => {
    expect(shouldLoad3d({ ...READY, webgl: false })).toBe(false);
  });

  it("keeps the still image when reduced motion is on", () => {
    expect(shouldLoad3d({ ...READY, reducedMotion: true })).toBe(false);
  });

  it("keeps the still image when data saver is on", () => {
    expect(shouldLoad3d({ ...READY, saveData: true })).toBe(false);
  });
});

describe("landingGardenSlots", () => {
  it("places every plant of the scene on its own spot", () => {
    const { slots } = landingGardenSlots("garden");
    expect(slots).toHaveLength(LANDING_GARDEN_PLANTS.garden.length);
    expect(new Set(slots.map((slot) => slot.x)).size).toBe(slots.length);
  });

  it("widens the camera beyond the pots so the ground and leaning leaves are not cut off", () => {
    const { slots, width } = landingGardenSlots("rebalance");
    const xs = slots.map((slot) => slot.x);
    expect(width).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
  });

  it("shows one upright and one leaning plant in the rebalancing scene", () => {
    const flags = LANDING_GARDEN_PLANTS.rebalance.map((plant) => plant.needsRebalance);
    expect(flags).toEqual([false, true]);
  });
});

describe("growth scene", () => {
  it("shows the same plant at every stage from seed to fruit, in order", () => {
    const plants = LANDING_GARDEN_PLANTS.growth;
    expect(plants.map((plant) => plant.stage)).toEqual([
      "seed",
      "sprout",
      "sapling",
      "tree",
      "bloom",
    ]);
    expect(plants.map((plant) => plant.ripe)).toEqual([false, false, false, false, true]);
  });

  it("stands the five plants in one row, left to right", () => {
    const { slots } = landingGardenSlots("growth");
    expect(new Set(slots.map((slot) => slot.z)).size).toBe(1);
    const xs = slots.map((slot) => slot.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe("landing images", () => {
  it.each(Object.keys(LANDING_GARDEN_PLANTS))(
    "has light and dark stills for the %s scene",
    (scene) => {
      expect(existsSync(join(PUBLIC_LANDING, `${scene}-light.webp`))).toBe(true);
      expect(existsSync(join(PUBLIC_LANDING, `${scene}-dark.webp`))).toBe(true);
    }
  );
});
