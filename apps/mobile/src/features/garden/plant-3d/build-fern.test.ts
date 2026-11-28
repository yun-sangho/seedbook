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

function hiddenCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((node) => {
    if (!node.visible) count++;
  });
  return count;
}

/** 보이는 잎줄기(정점 색) 의 빨강 평균 — 초록이 누렇게·금빛으로 바뀌면 커진다. */
function meanVertexRed(root: THREE.Object3D): number {
  let sum = 0;
  let count = 0;
  root.traverseVisible((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const color = node.geometry.getAttribute("color");
    if (!color) return;
    for (let i = 0; i < color.count; i++) sum += color.getX(i);
    count += color.count;
  });
  return sum / count;
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
    // 이슬은 잎줄기 지오메트리에 합쳐져 있다 (정점 색 = 이슬 색).
    const dew = new THREE.Color("#E4F6FF");
    const dewVertices = (stage: PlantStage) =>
      meshes(fern({ stage }).root).reduce((sum, mesh) => {
        const color = mesh.geometry.getAttribute("color");
        if (!color) return sum;
        let count = 0;
        for (let i = 0; i < color.count; i++) {
          if (Math.abs(color.getX(i) - dew.r) + Math.abs(color.getZ(i) - dew.b) < 1e-4) count++;
        }
        return sum + count;
      }, 0);
    expect(dewVertices("tree")).toBe(0);
    expect(dewVertices("bloom")).toBeGreaterThan(0);
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

  it("hangs its fronds lower as it wilts without shrinking the stage", () => {
    const fresh = bounds(fern({ stage: "tree", wilt: 0 }).root);
    const wilted = bounds(fern({ stage: "tree", wilt: 0.7 }).root);
    expect(wilted.max.y).toBeLessThan(fresh.max.y);
    expect(wilted.max.x - wilted.min.x).toBeGreaterThan((fresh.max.x - fresh.min.x) * 0.8);
  });

  it("yellows its fronds as it wilts", () => {
    expect(meanVertexRed(fern({ stage: "tree", wilt: 0.35 }).root)).toBeGreaterThan(
      meanVertexRed(fern({ stage: "tree", wilt: 0 }).root)
    );
  });

  it("sheds about 30% of the fronds only from the last wilt step", () => {
    // 고사리 단계 잎줄기 11개 → 3개
    expect(hiddenCount(fern({ stage: "tree", wilt: 0.7 }).root)).toBe(0);
    expect(hiddenCount(fern({ stage: "tree", wilt: 1 }).root)).toBe(3);
  });

  it("keeps its colors in the wind", () => {
    expect(meanVertexRed(fern({ stage: "tree", wind: 0.5 }).root)).toBe(
      meanVertexRed(fern({ stage: "tree" }).root)
    );
  });

  it("sways wider in the wind, like the tree", () => {
    const range = (built: ReturnType<typeof fern>) => {
      const samples: number[] = [];
      for (let t = 0; t < 4; t += 0.02) {
        built.update(t, PX);
        samples.push(body(built.root).rotation.z);
      }
      return Math.max(...samples) - Math.min(...samples);
    };
    expect(range(fern({ stage: "tree", wind: 0.5 }))).toBeGreaterThan(
      range(fern({ stage: "tree" })) * 2
    );
  });

  it("gilds the frond tips when ripe (full fern only)", () => {
    expect(meanVertexRed(fern({ stage: "bloom", ripe: 1 }).root)).toBeGreaterThan(
      meanVertexRed(fern({ stage: "bloom", ripe: 0 }).root) + 0.02
    );
    expect(meanVertexRed(fern({ stage: "tree", ripe: 1 }).root)).toBe(
      meanVertexRed(fern({ stage: "tree", ripe: 0 }).root)
    );
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
