import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { leafGeometry, veinGeometry } from "./leaf-geometry";

/** 잎 윗면(-Z, 기울였을 때 위쪽)에서 +Z 로 쏜 광선이 mesh 와 처음 만나는 z. */
function surfaceZ(geometry: THREE.BufferGeometry, x: number, y: number): number | null {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const raycaster = new THREE.Raycaster(new THREE.Vector3(x, y, -10), new THREE.Vector3(0, 0, 1));
  const hit = raycaster.intersectObject(mesh)[0];
  return hit ? hit.point.z : null;
}

/** 잎맥이 있는 자리 (잎 길이 1 기준). */
const VEIN_SAMPLES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].flatMap((y) =>
  [-0.005, 0, 0.005].map((x) => ({ x, y }))
);

describe("leaf vein", () => {
  const leaf = leafGeometry();
  const vein = veinGeometry();

  it("covers the leaf midline from base to near the tip", () => {
    for (const { x, y } of VEIN_SAMPLES) {
      expect(surfaceZ(vein, x, y), `vein at (${x}, ${y})`).not.toBeNull();
    }
  });

  it("sits on the upper face of the leaf (never behind it)", () => {
    for (const { x, y } of VEIN_SAMPLES) {
      const veinZ = surfaceZ(vein, x, y) ?? Number.NaN;
      const leafZ = surfaceZ(leaf, x, y) ?? Number.NaN;
      expect(veinZ, `vein at (${x}, ${y})`).toBeLessThan(leafZ);
    }
  });

  it("lies right against the leaf surface instead of floating above it", () => {
    for (const { x, y } of VEIN_SAMPLES) {
      const veinZ = surfaceZ(vein, x, y) ?? Number.NaN;
      const leafZ = surfaceZ(leaf, x, y) ?? Number.NaN;
      expect(leafZ - veinZ, `gap at (${x}, ${y})`).toBeLessThan(0.01);
    }
  });
});

describe("leaf surface", () => {
  it("folds along the midline: the middle sits higher (+Z) than either side", () => {
    const leaf = leafGeometry();
    for (const y of [0.3, 0.5, 0.7]) {
      const mid = surfaceZ(leaf, 0, y) ?? Number.NaN;
      const left = surfaceZ(leaf, -0.15, y) ?? Number.NaN;
      const right = surfaceZ(leaf, 0.15, y) ?? Number.NaN;
      expect(mid, `y=${y}`).toBeGreaterThan(left + 0.03);
      expect(mid, `y=${y}`).toBeGreaterThan(right + 0.03);
    }
  });
});

/** 잎 아랫면(+Z)에서 -Z 로 쏜 광선이 mesh 와 처음 만나는 z. */
function undersideZ(geometry: THREE.BufferGeometry, x: number, y: number): number | null {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const raycaster = new THREE.Raycaster(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, -1));
  const hit = raycaster.intersectObject(mesh)[0];
  return hit ? hit.point.z : null;
}

/** y 높이에서 잎맥이 덮는 폭 (가운데에서 바깥으로 훑어 처음 빈 곳까지). */
function veinWidthAt(geometry: THREE.BufferGeometry, y: number): number {
  let x = 0;
  while (x < 0.1 && surfaceZ(geometry, x, y) !== null) x += 0.001;
  return x * 2;
}

describe("leaf midrib", () => {
  const leaf = leafGeometry();
  const vein = veinGeometry();

  it("starts right at the leaf base so it meets the stem", () => {
    expect(surfaceZ(vein, 0, 0.015)).not.toBeNull();
  });

  it("tapers from the base toward the tip", () => {
    const base = veinWidthAt(vein, 0.1);
    const middle = veinWidthAt(vein, 0.45);
    const nearTip = veinWidthAt(vein, 0.75);
    expect(middle).toBeLessThan(base);
    expect(nearTip).toBeLessThan(middle);
  });

  it("shows on the underside too (in front of the leaf seen from below)", () => {
    for (const y of [0.2, 0.4, 0.6]) {
      const veinZ = undersideZ(vein, 0, y) ?? Number.NEGATIVE_INFINITY;
      const leafZ = undersideZ(leaf, 0, y) ?? Number.NaN;
      expect(veinZ, `y=${y}`).toBeGreaterThan(leafZ);
    }
  });
});
