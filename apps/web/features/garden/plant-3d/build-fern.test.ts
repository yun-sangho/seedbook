import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlant } from "./build-plant";
import { DEFAULT_PLANT_OPTIONS, type PlantOptions, type PlantStage } from "./plant-options";
import { REBALANCE_BADGE_KEY } from "./rebalance-badge";

// jsdom 에는 2D 캔버스가 없다 (그림자·배지·반짝임 텍스처는 빈 캔버스로 만들어진다).
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const PX = 0.002;

function fern(overrides: Partial<PlantOptions> = {}) {
  return buildPlant({ ...DEFAULT_PLANT_OPTIONS, kind: "fern", ...overrides });
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) found.push(node);
  });
  return found;
}

function triangles(root: THREE.Object3D): number {
  return meshes(root).reduce((sum, mesh) => {
    const geometry = mesh.geometry;
    return sum + (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
  }, 0);
}

function body(root: THREE.Group): THREE.Object3D {
  const group = root.children.find(
    (child) => child instanceof THREE.Group && child.children.length > 0
  );
  if (!group) throw new Error("body not found");
  return group;
}

function bounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

describe("buildPlant (fern)", () => {
  it("plants a seed the same size as the tree's seed", () => {
    const size = (box: THREE.Box3) => box.getSize(new THREE.Vector3());
    const tree = size(bounds(buildPlant({ ...DEFAULT_PLANT_OPTIONS, stage: "seed" }).root));
    expect(size(bounds(fern({ stage: "seed" }).root))).toEqual(tree);
  });

  it("colors its seed differently from the tree's seed so the kind shows from the start", () => {
    const colors = (root: THREE.Object3D) =>
      new Set(
        meshes(root).flatMap((mesh) => {
          const material = mesh.material as THREE.Material & { color?: THREE.Color };
          return material.color ? [material.color.getHexString()] : [];
        })
      );
    const tree = colors(buildPlant({ ...DEFAULT_PLANT_OPTIONS, stage: "seed" }).root);
    const fernColors = colors(fern({ stage: "seed" }).root);
    expect([...fernColors].some((c) => !tree.has(c))).toBe(true);
  });

  it("spreads wider and fuller from sprout to the full fern", () => {
    const stages: PlantStage[] = ["sprout", "sapling", "tree", "bloom"];
    const widths = stages.map((stage) => {
      const box = bounds(fern({ stage }).root);
      return box.max.x - box.min.x;
    });
    const weights = stages.map((stage) => triangles(fern({ stage }).root));
    for (let i = 1; i < stages.length; i++) {
      expect(widths[i]).toBeGreaterThan((widths[i - 1] ?? 0) - 0.01);
      expect(weights[i]).toBeGreaterThan(weights[i - 1] ?? 0);
    }
  });

  it("lets the full fern's fronds hang over the pot edge", () => {
    const box = bounds(fern({ stage: "bloom" }).root);
    // 화분 테두리 반지름은 0.58.
    expect(box.max.x).toBeGreaterThan(1);
    expect(box.min.y).toBeGreaterThan(-0.01);
  });

  it("draws each frond in one draw call instead of one per leaflet", () => {
    const tree = meshes(buildPlant({ ...DEFAULT_PLANT_OPTIONS, stage: "bloom" }).root).length;
    expect(meshes(fern({ stage: "bloom" }).root).length).toBeLessThan(tree);
  });

  it("hangs dew drops on the fronds at the full stage", () => {
    const hasDew = (stage: PlantStage) =>
      meshes(fern({ stage }).root).some((mesh) => mesh.geometry instanceof THREE.SphereGeometry);
    expect(hasDew("tree")).toBe(false);
    expect(hasDew("bloom")).toBe(true);
  });

  it("twinkles sparkles around the full fern", () => {
    const built = fern({ stage: "bloom" });
    const sparkles: THREE.Sprite[] = [];
    built.root.traverse((node) => {
      if (node instanceof THREE.Sprite && !node.userData[REBALANCE_BADGE_KEY]) sparkles.push(node);
    });
    expect(sparkles.length).toBeGreaterThan(0);
    const sizes = [0, 0.4, 0.8, 1.2, 1.6].map((time) => {
      built.update(time, PX);
      return sparkles.map((s) => s.scale.x).join(",");
    });
    expect(new Set(sizes).size).toBeGreaterThan(1);
  });

  it("droops its fronds lower without shrinking the stage", () => {
    const fresh = bounds(fern({ stage: "tree", droop: 0 }).root);
    const drooped = bounds(fern({ stage: "tree", droop: 1 }).root);
    expect(drooped.max.y).toBeLessThan(fresh.max.y);
    expect(drooped.max.x - drooped.min.x).toBeGreaterThan((fresh.max.x - fresh.min.x) * 0.8);
  });

  it("tilts and shows the badge when rebalancing is needed, like the tree", () => {
    const upright = fern({ stage: "tree" });
    const tilted = fern({ stage: "tree", needsRebalance: true });
    upright.update(0, PX);
    tilted.update(0, PX);
    expect(Math.abs(body(tilted.root).rotation.z)).toBeGreaterThan(
      Math.abs(body(upright.root).rotation.z) + 0.2
    );
    const badges: THREE.Object3D[] = [];
    tilted.root.traverse((node) => {
      if (node.userData[REBALANCE_BADGE_KEY]) badges.push(node);
    });
    expect(badges.length).toBeGreaterThan(0);
  });

  it("releases frond geometry on dispose", () => {
    const built = fern({ stage: "bloom" });
    const frond = meshes(built.root).find((mesh) => mesh.geometry.getAttribute("color"));
    const onDispose = vi.fn();
    frond?.geometry.addEventListener("dispose", onDispose);
    built.dispose();
    expect(onDispose).toHaveBeenCalled();
  });
});
