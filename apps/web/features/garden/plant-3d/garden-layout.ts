/**
 * 정원에 식물을 놓는 자리. 3D 와 무관한 순수 계산이라 단위 테스트한다.
 *
 * - 1~3개: 한 줄
 * - 4~8개: 두 줄, 뒷줄은 반 칸 어긋나게 (앞 식물에 가리지 않게)
 * - 9개 이상: 한 줄에 4개씩
 */

export const GARDEN_SPACING_X = 1.55;
export const GARDEN_SPACING_Z = 1.45;

export interface GardenSpot {
  x: number;
  z: number;
}

export interface GardenLayout {
  spots: GardenSpot[];
  /** 놓인 식물들의 가로·세로 폭 (화분 중심 기준). */
  width: number;
  depth: number;
}

function perRowFor(count: number): number {
  if (count <= 3) return count;
  if (count <= 8) return Math.ceil(count / 2);
  return 4;
}

export function gardenLayout(count: number): GardenLayout {
  if (count <= 0) return { spots: [], width: 0, depth: 0 };
  const perRow = perRowFor(count);
  const rows = Math.ceil(count / perRow);
  const spots: GardenSpot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const col = i % perRow;
    // 뒷줄(row 0 이 맨 뒤)은 반 칸 어긋난다.
    const stagger = rows > 1 && (rows - 1 - row) % 2 === 1 ? GARDEN_SPACING_X / 2 : 0;
    const x = (col - (inRow - 1) / 2) * GARDEN_SPACING_X + stagger;
    const z = (row - (rows - 1) / 2) * GARDEN_SPACING_Z;
    spots.push({ x, z });
  }
  const xs = spots.map((s) => s.x);
  const zs = spots.map((s) => s.z);
  return {
    spots,
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
  };
}
