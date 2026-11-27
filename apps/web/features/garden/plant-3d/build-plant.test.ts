import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlant } from "./build-plant";
import { DEFAULT_PLANT_OPTIONS, type PlantOptions } from "./plant-options";
import { REBALANCE_BADGE_KEY } from "./rebalance-badge";

// jsdom 에는 2D 캔버스가 없다 (그림자·배지 텍스처는 빈 캔버스로 만들어진다).
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const PX = 0.002;

function plant(overrides: Partial<PlantOptions> = {}) {
  return buildPlant({ ...DEFAULT_PLANT_OPTIONS, ...overrides });
}

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) count++;
  });
  return count;
}

function findBadges(root: THREE.Object3D): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node.userData[REBALANCE_BADGE_KEY]) found.push(node);
  });
  return found;
}

/** 화분 위에서 자라는 몸통 (기울기·흔들림이 걸리는 그룹). */
function body(root: THREE.Group): THREE.Object3D {
  const group = root.children.find(
    (child) => child instanceof THREE.Group && child.children.length > 0
  );
  if (!group) throw new Error("body not found");
  return group;
}

describe("buildPlant", () => {
  it("grows taller from seed to tree", () => {
    const heights = (["seed", "sprout", "sapling", "tree"] as const).map((stage) => {
      const box = new THREE.Box3().setFromObject(plant({ stage }).root);
      return box.max.y - box.min.y;
    });
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1] ?? 0);
    }
  });

  it("adds flowers and fruit on top of the tree at the bloom stage", () => {
    expect(countMeshes(plant({ stage: "bloom" }).root)).toBeGreaterThan(
      countMeshes(plant({ stage: "tree" }).root)
    );
  });

  it("has no rebalance badge when rebalancing is not needed", () => {
    expect(findBadges(plant({ needsRebalance: false }).root)).toHaveLength(0);
  });

  it("shows a tappable rebalance badge when rebalancing is needed", () => {
    const built = plant({ needsRebalance: true });
    expect(findBadges(built.root).length).toBeGreaterThan(0);
  });

  it("tilts the body to one side when rebalancing is needed", () => {
    const upright = plant({ needsRebalance: false });
    const tilted = plant({ needsRebalance: true });
    upright.update(0, PX);
    tilted.update(0, PX);
    expect(Math.abs(body(tilted.root).rotation.z)).toBeGreaterThan(
      Math.abs(body(upright.root).rotation.z) + 0.2
    );
  });

  it("sizes the badge in screen pixels so it looks the same in every view", () => {
    const built = plant({ needsRebalance: true });
    built.update(0, PX);
    const [visible] = findBadges(built.root).filter((node) => node instanceof THREE.Sprite);
    const small = visible?.scale.x ?? 0;
    built.update(0, PX * 2);
    expect(visible?.scale.x).toBeCloseTo(small * 2);
  });

  it("keeps the same stage size when drooping (only leaves and color change)", () => {
    const fresh = new THREE.Box3().setFromObject(plant({ stage: "tree", droop: 0 }).root);
    const drooped = new THREE.Box3().setFromObject(plant({ stage: "tree", droop: 1 }).root);
    const height = (box: THREE.Box3) => box.max.y - box.min.y;
    expect(height(drooped)).toBeGreaterThan(height(fresh) * 0.85);
    expect(height(drooped)).toBeLessThanOrEqual(height(fresh) + 0.01);
  });

  it("releases its geometry and materials on dispose", () => {
    const built = plant({ stage: "bloom", needsRebalance: true });
    const geometry = (built.root.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh)
      .geometry;
    const onDispose = vi.fn();
    geometry.addEventListener("dispose", onDispose);
    built.dispose();
    expect(onDispose).toHaveBeenCalled();
  });
});
