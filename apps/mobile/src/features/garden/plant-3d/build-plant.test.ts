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

/** 숨긴(떨어진) 잎 수. */
function hidden(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((node) => {
    if (!node.visible) count++;
  });
  return count;
}

function materialColors(root: THREE.Object3D): THREE.Color[] {
  const found: THREE.Color[] = [];
  root.traverseVisible((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const color = (node.material as THREE.Material & { color?: THREE.Color }).color;
    if (color) found.push(color);
  });
  return found;
}

function colors(root: THREE.Object3D): string[] {
  return materialColors(root).map((c) => c.getHexString());
}

/** 보이는 mesh 재질 색의 빨강 평균 — 초록 잎이 누렇게 바래면 커진다. */
function meanRed(root: THREE.Object3D): number {
  const all = materialColors(root);
  return all.reduce((sum, c) => sum + c.r, 0) / all.length;
}

/** 열매 (반지름 0.085 구). */
function fruits(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (
      node instanceof THREE.Mesh &&
      node.geometry instanceof THREE.SphereGeometry &&
      node.geometry.parameters.radius === 0.085
    )
      found.push(node);
  });
  return found;
}

/** 4초 동안 몸통 좌우 기울기 (rotation.z) 의 폭·평균·평균을 가로지른 횟수. */
function swing(built: ReturnType<typeof plant>) {
  const samples: number[] = [];
  for (let t = 0; t < 4; t += 0.02) {
    built.update(t, PX);
    samples.push(body(built.root).rotation.z);
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if (((samples[i - 1] ?? 0) - mean) * ((samples[i] ?? 0) - mean) < 0) crossings++;
  }
  return { range: Math.max(...samples) - Math.min(...samples), mean, crossings };
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

  it("keeps the same stage size when wilting (only leaves and color change)", () => {
    const fresh = new THREE.Box3().setFromObject(plant({ stage: "tree", wilt: 0 }).root);
    const wilted = new THREE.Box3().setFromObject(plant({ stage: "tree", wilt: 1 }).root);
    const height = (box: THREE.Box3) => box.max.y - box.min.y;
    expect(height(wilted)).toBeGreaterThan(height(fresh) * 0.85);
    expect(height(wilted)).toBeLessThanOrEqual(height(fresh) + 0.01);
  });

  it("yellows the leaves from the first wilt step", () => {
    for (const stage of ["sprout", "sapling", "tree"] as const) {
      expect(meanRed(plant({ stage, wilt: 0.35 }).root)).toBeGreaterThan(
        meanRed(plant({ stage, wilt: 0 }).root)
      );
    }
  });

  it("sheds about 30% of the leaves only from the last wilt step", () => {
    expect(hidden(plant({ stage: "sapling", wilt: 0.7 }).root)).toBe(0);
    // 묘목 잎 8장 → 2장
    expect(hidden(plant({ stage: "sapling", wilt: 1 }).root)).toBe(2);
  });

  it("sheds the same leaves every time for the same seed", () => {
    const shed = (seed: number) => {
      const names: number[] = [];
      let i = 0;
      plant({ stage: "sapling", wilt: 1, seed }).root.traverse((node) => {
        if (!node.visible) names.push(i);
        i++;
      });
      return names.join(",");
    };
    expect(shed(3)).toBe(shed(3));
  });

  it("drops the shed leaves on the soil", () => {
    expect(countMeshes(plant({ stage: "sapling", wilt: 1 }).root)).toBeGreaterThan(
      countMeshes(plant({ stage: "sapling", wilt: 0.7 }).root)
    );
  });

  it("sways wider and faster in the wind", () => {
    const calm = swing(plant({ stage: "tree", wind: 0 }));
    const windy = swing(plant({ stage: "tree", wind: 0.5 }));
    expect(windy.range).toBeGreaterThan(calm.range * 2);
    expect(windy.crossings).toBeGreaterThan(calm.crossings);
  });

  it("leans a little to one side in the wind", () => {
    const calm = swing(plant({ stage: "tree", wind: 0 }));
    const windy = swing(plant({ stage: "tree", wind: 0.5 }));
    expect(Math.abs(windy.mean)).toBeGreaterThan(Math.abs(calm.mean) + 0.03);
  });

  it("keeps the colors in the wind (a market drop is not the plant's fault)", () => {
    for (const stage of ["sapling", "bloom"] as const) {
      expect(colors(plant({ stage, wind: 0.5 }).root)).toEqual(colors(plant({ stage }).root));
    }
  });

  it("grows and reddens the fruit as it ripens", () => {
    const green = fruits(plant({ stage: "bloom", ripe: 0 }).root);
    const ripe = fruits(plant({ stage: "bloom", ripe: 1 }).root);
    expect(green.length).toBeGreaterThan(0);
    expect(ripe).toHaveLength(green.length);
    const [g, r] = [green[0], ripe[0]];
    if (!g || !r) throw new Error("no fruit");
    expect(r.scale.x).toBeGreaterThan(g.scale.x * 1.3);
    const color = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshToonMaterial).color;
    expect(color(r).g).toBeLessThan(color(g).g);
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

describe("stem tip", () => {
  /** 줄기(몸통의 첫 mesh) 끝 바로 위에서 아래로 쏜 광선이 줄기와 만나는 높이. */
  function stemTipHitY(stage: "sprout" | "sapling"): { hitY: number | null; topY: number } {
    const built = plant({ stage, needsRebalance: false });
    built.root.updateMatrixWorld(true);
    const stem = body(built.root).children.find((child) => child instanceof THREE.Mesh);
    if (!stem) throw new Error("stem not found");
    // 줄기 끝 고리(가장 높은 정점들)의 가운데 — 끝 근처의 줄기는 곧게 서 있다.
    const position = (stem as THREE.Mesh).geometry.getAttribute("position");
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < position.count; i++) {
      points.push(
        new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(stem.matrixWorld)
      );
    }
    const ringY = Math.max(...points.map((point) => point.y)) - 0.01;
    const ring = points.filter((point) => point.y > ringY);
    const tip = ring
      .reduce((sum, point) => sum.add(point), new THREE.Vector3())
      .divideScalar(ring.length);
    const raycaster = new THREE.Raycaster(
      // 정점(구의 극)을 정확히 지나면 삼각형 경계에서 빗나갈 수 있어 살짝 비켜 쏜다.
      new THREE.Vector3(tip.x + 0.004, tip.y + 1, tip.z + 0.003),
      new THREE.Vector3(0, -1, 0)
    );
    const hit = raycaster.intersectObject(stem)[0];
    return { hitY: hit ? hit.point.y : null, topY: ringY + 0.01 };
  }

  it.each(["sprout", "sapling"] as const)("%s stem ends closed, not as an open tube", (stage) => {
    const { hitY, topY } = stemTipHitY(stage);
    expect(hitY).not.toBeNull();
    expect(topY - (hitY ?? Number.NEGATIVE_INFINITY)).toBeLessThan(0.02);
  });
});

describe("bloom fruit", () => {
  function meshes(root: THREE.Object3D): THREE.Mesh[] {
    const found: THREE.Mesh[] = [];
    root.updateMatrixWorld(true);
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) found.push(node);
    });
    return found;
  }

  it.each([
    { seed: 7, wilt: 0, ripe: 0 },
    { seed: 1, wilt: 0, ripe: 1 },
    { seed: 42, wilt: 0.7, ripe: 1 },
  ])(
    "hangs outside the leaf clumps so it can be seen (seed $seed, wilt $wilt, ripe $ripe)",
    ({ seed, wilt, ripe }) => {
      const all = meshes(plant({ stage: "bloom", seed, wilt, ripe, needsRebalance: false }).root);
      const radiusOf = (mesh: THREE.Mesh) =>
        mesh.geometry instanceof THREE.SphereGeometry ? mesh.geometry.parameters.radius : 0;
      // 꽃잎(0.075)·꽃 가운데(0.05)보다 크고 잎 뭉치(0.3 이상)보다 작은 구가 열매다.
      const fruits = all.filter((mesh) => radiusOf(mesh) > 0.08 && radiusOf(mesh) < 0.25);
      const clumps = all.filter((mesh) => radiusOf(mesh) >= 0.25);
      expect(fruits.length).toBeGreaterThanOrEqual(1);
      for (const fruit of fruits) {
        const center = fruit.getWorldPosition(new THREE.Vector3());
        for (const clump of clumps) {
          const distance = center.distanceTo(clump.getWorldPosition(new THREE.Vector3()));
          const radius = (clump.geometry as THREE.SphereGeometry).parameters.radius;
          expect(distance).toBeGreaterThan(radius);
        }
      }
    }
  );

  /** 열매가 매달린 가지 끝 뭉치별 개수 (가장 가까운 뭉치 기준). */
  function fruitsPerClump(seed: number): number[] {
    const all = meshes(plant({ stage: "bloom", seed, needsRebalance: false }).root);
    const radiusOf = (mesh: THREE.Mesh) =>
      mesh.geometry instanceof THREE.SphereGeometry ? mesh.geometry.parameters.radius : 0;
    const fruits = all.filter((mesh) => radiusOf(mesh) > 0.08 && radiusOf(mesh) < 0.25);
    const clumps = all.filter((mesh) => radiusOf(mesh) >= 0.25);
    const counts = clumps.map(() => 0);
    const gap = (at: THREE.Vector3, clump: THREE.Mesh) =>
      at.distanceTo(clump.getWorldPosition(new THREE.Vector3())) - radiusOf(clump);
    for (const fruit of fruits) {
      const at = fruit.getWorldPosition(new THREE.Vector3());
      const gaps = clumps.map((clump) => gap(at, clump));
      const nearest = gaps.indexOf(Math.min(...gaps));
      counts[nearest] = (counts[nearest] ?? 0) + 1;
    }
    return counts;
  }

  it("keeps only a few fruits on the whole tree", () => {
    for (const seed of [1, 2, 3, 7, 42, 100]) {
      const total = fruitsPerClump(seed).reduce((sum, n) => sum + n, 0);
      expect(total, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(total, `seed ${seed}`).toBeLessThanOrEqual(3);
    }
  });

  it("spreads a different number of fruits over the clumps per tree", () => {
    const patterns = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => fruitsPerClump(seed).join(","))
    );
    expect(patterns.size).toBeGreaterThan(2);
  });
});
