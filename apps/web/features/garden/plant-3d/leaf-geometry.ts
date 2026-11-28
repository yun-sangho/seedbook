import * as THREE from "three";

/**
 * 나무 단계 식물의 잎과 잎맥 (길이 1, +Y 로 자란다).
 *
 * 잎과 잎맥은 같은 곡면 `leafSurfaceZ` 위에 놓는다. 잎을 윤곽선만으로 삼각분할하면 가운데(x=0)에
 * 정점이 없어 접힌 곡면을 따라가지 못하고, 잎맥만 곡면을 따라가 잎에서 떠 보인다 — 그래서 잎은
 * 가운데 열이 있는 격자로 만든다.
 */

/** 씨앗 아바타의 잎 윤곽(`components/seed-avatar.tsx`) 왼쪽 반 — 아래(0,0) 에서 끝(0,1) 까지. */
const OUTLINE = new THREE.CubicBezierCurve(
  new THREE.Vector2(0, 0),
  new THREE.Vector2(-0.42, 0.22),
  new THREE.Vector2(-0.42, 0.7),
  new THREE.Vector2(0, 1)
);
/** 잎 길이 방향 줄 수 / 가운데에서 가장자리까지 칸 수. */
const LEAF_ROWS = 14;
const LEAF_HALF_COLUMNS = 3;

/** 잎맥 폭·범위와 잎 윗면에서 띄우는 거리 (z-fighting 만 피할 만큼). */
const VEIN_HALF_WIDTH = 0.0175;
const VEIN_START = 0.045;
const VEIN_END = 0.795;
const VEIN_ROWS = 12;
const VEIN_LIFT = 0.004;

/** 잎 곡면: 가운데(잎맥)가 접혀 솟고 끝이 아래로 휜다 (+Z 가 기울였을 때 아래쪽). */
function leafSurfaceZ(x: number, y: number): number {
  return -Math.abs(x) * 0.35 + y * y * 0.28;
}

/** 줄(row)·열(column) 격자를 삼각형 띠로 잇는다. 정점은 줄마다 `columns` 개씩. */
function gridGeometry(points: THREE.Vector3[], rows: number, columns: number) {
  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < columns - 1; c++) {
      const a = r * columns + c;
      const b = a + columns;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 씨앗 아바타의 잎 모양을 길이 1 로 옮겨 가운데가 접히고 끝이 휜 잎. */
export function leafGeometry(): THREE.BufferGeometry {
  const columns = LEAF_HALF_COLUMNS * 2 + 1;
  const points: THREE.Vector3[] = [];
  for (let r = 0; r <= LEAF_ROWS; r++) {
    const edge = OUTLINE.getPoint(r / LEAF_ROWS);
    const halfWidth = Math.abs(edge.x);
    for (let c = 0; c < columns; c++) {
      const x = ((c - LEAF_HALF_COLUMNS) / LEAF_HALF_COLUMNS) * halfWidth;
      points.push(new THREE.Vector3(x, edge.y, leafSurfaceZ(x, edge.y)));
    }
  }
  return gridGeometry(points, LEAF_ROWS + 1, columns);
}

/** 잎 가운데의 잎맥: 잎 곡면을 그대로 따라 접히고 휘는 가는 띠 (윗면에 살짝 띄운다). */
export function veinGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let r = 0; r <= VEIN_ROWS; r++) {
    const y = VEIN_START + ((VEIN_END - VEIN_START) * r) / VEIN_ROWS;
    for (const x of [-VEIN_HALF_WIDTH, 0, VEIN_HALF_WIDTH]) {
      points.push(new THREE.Vector3(x, y, leafSurfaceZ(x, y) - VEIN_LIFT));
    }
  }
  return gridGeometry(points, VEIN_ROWS + 1, 3);
}
