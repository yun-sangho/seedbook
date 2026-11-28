import * as THREE from "three";

/**
 * 비: 식물 위 작은 비구름에서 빗줄기가 떨어진다 (시장 하락, `plantRain`). 많이 내려갈수록 빗줄기가 많고
 * 굵고 빠르고 구름이 짙다. 식물(잎 색·처짐)은 바꾸지 않는다 — 그건 시듦(비중 이탈)이 정한다.
 *
 * 빗줄기는 `InstancedMesh` 하나(지오메트리·재질 하나)로 그리고, 매 프레임 미리 만든 행렬만 고쳐 쓴다
 * (할당 없음). 구름은 공 몇 개가 지오메트리 하나를 같이 쓰고, 재질은 식물 재질 묶음에서 받는다.
 */

export const RAIN_KEY = "rain";

const DROP_COLOR = "#8DB8DE";
const CLOUD_LIGHT = "#E4E9EE";
const CLOUD_DARK = "#9AA6B2";
/** 빗줄기 수 (약한 비 → 센 비). */
const MIN_DROPS = 5;
const MAX_DROPS = 22;
/** 빗줄기가 떨어지는 가로·앞뒤 범위 (구름 아래, 식물 중심 기준). */
const SPREAD_X = 0.62;
const SPREAD_Z = 0.42;
/** 구름 밑면이 식물 꼭대기보다 이만큼 위. */
const CLOUD_GAP = 0.42;
/** 빗줄기가 떨어지며 왼쪽으로 비껴가는 거리 (살짝 비스듬한 비). */
const SLANT = 0.12;
/** 땅에 닿기 전 이 비율 동안 줄기가 짧아지며 사라진다 (갑자기 사라지지 않게). */
const FADE_SHARE = 0.12;

/** 비 세기(0~1) → 모양. 비가 없으면 null. */
export interface RainLook {
  drops: number;
  /** 빗줄기 굵기 (반지름). */
  radius: number;
  /** 빗줄기 길이. */
  length: number;
  /** 구름에서 땅까지 떨어지는 시간 (초). */
  fallSeconds: number;
  opacity: number;
  cloudColor: string;
}

export function rainLook(rain: number): RainLook | null {
  if (!(rain > 0)) return null;
  const s = Math.min(1, rain);
  return {
    drops: Math.round(MIN_DROPS + (MAX_DROPS - MIN_DROPS) * s),
    radius: 0.007 + 0.011 * s,
    length: 0.14 + 0.12 * s,
    fallSeconds: 1.05 - 0.4 * s,
    opacity: 0.55 + 0.3 * s,
    cloudColor: `#${new THREE.Color(CLOUD_LIGHT).lerp(new THREE.Color(CLOUD_DARK), s).getHexString()}`,
  };
}

export interface Rain {
  object: THREE.Object3D;
  update(time: number): void;
  dispose(): void;
}

/** 시드로 정해지는 0~1 (가닥마다 다르게, 같은 시드면 늘 같게). */
function hash01(seed: number, i: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233 + salt * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

/** 구름 공 (x, y, 반지름) — 밑이 평평하고 가운데가 솟은 뭉게구름. */
const PUFFS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.36, 0.06, 0.2],
  [-0.1, 0.14, 0.27],
  [0.2, 0.1, 0.23],
  [0.44, 0.04, 0.16],
];

/**
 * @param rain 0~1. 0 이면 만들지 않는다 (null).
 * @param height 식물 꼭대기 높이 (화분 바닥 기준) — 구름이 그 위에 뜬다.
 * @param cloudMaterial 구름 재질 (식물 재질 묶음이 만들고 치운다).
 */
export function createRain(
  rain: number,
  height: number,
  seed: number,
  cloudMaterial: (color: THREE.ColorRepresentation) => THREE.Material
): Rain | null {
  const look = rainLook(rain);
  if (!look) return null;
  const group = new THREE.Group();
  group.userData[RAIN_KEY] = true;
  const top = height + CLOUD_GAP;

  const puffGeometry = new THREE.SphereGeometry(1, 14, 10);
  const cloud = new THREE.Group();
  const material = cloudMaterial(look.cloudColor);
  for (const [x, y, r] of PUFFS) {
    const puff = new THREE.Mesh(puffGeometry, material);
    puff.position.set(x, y, 0);
    puff.scale.set(r, r * 0.82, r * 0.9);
    puff.raycast = () => {};
    cloud.add(puff);
  }
  cloud.position.set(-0.04, top, 0.1);
  group.add(cloud);

  const dropGeometry = new THREE.CylinderGeometry(1, 1, 1, 5, 1);
  const dropMaterial = new THREE.MeshBasicMaterial({
    color: DROP_COLOR,
    transparent: true,
    opacity: look.opacity,
    depthWrite: false,
  });
  const drops = new THREE.InstancedMesh(dropGeometry, dropMaterial, look.drops);
  drops.raycast = () => {};
  drops.renderOrder = 2;
  drops.frustumCulled = false;
  group.add(drops);

  // 가닥마다 떨어지는 자리·출발 시각 (만들 때 한 번).
  const slots = Array.from({ length: look.drops }, (_, i) => ({
    x: (hash01(seed, i, 1) * 2 - 1) * SPREAD_X - 0.04,
    z: (hash01(seed, i, 2) * 2 - 1) * SPREAD_Z + 0.1,
    offset: (i + hash01(seed, i, 3) * 0.8) / look.drops,
  }));
  // 떨어지는 방향으로 살짝 기운 빗줄기.
  // 빗줄기 아래 끝이 떨어지는 높이 (위 끝이 구름 밑을 넘지 않게).
  const fall = top - look.length;
  const tilt = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    -Math.atan2(SLANT, fall)
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  const rain3d: Rain = {
    object: group,
    update(time) {
      // 인덱스 반복 (entries·forEach 는 매 프레임 반복자·클로저를 만든다).
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot) continue;
        const p = (((time / look.fallSeconds + slot.offset) % 1) + 1) % 1;
        const fade = p > 1 - FADE_SHARE ? (1 - p) / FADE_SHARE : 1;
        const length = look.length * Math.max(fade, 0.05);
        // 줄기 아래 끝이 땅(0) 밑으로 가지 않게 가운데를 잡는다.
        position.set(slot.x - p * SLANT, Math.max(fall * (1 - p), 0) + length / 2, slot.z);
        scale.set(look.radius, length, look.radius);
        drops.setMatrixAt(i, matrix.compose(position, tilt, scale));
      }
      drops.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      puffGeometry.dispose();
      dropGeometry.dispose();
      dropMaterial.dispose();
      drops.dispose();
    },
  };
  rain3d.update(0);
  return rain3d;
}
