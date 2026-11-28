import * as THREE from "three";

/**
 * 비: 식물 위 작은 비구름에서 빗줄기가 떨어진다 (시장 하락, `plantRain`). 많이 내려갈수록 빗줄기가 많고
 * 굵고 빠르고 구름이 짙다. 식물(잎 색·처짐)은 바꾸지 않는다 — 그건 시듦(비중 이탈)이 정한다.
 *
 * 구름은 단순한 도형 셋 (누운 알약 하나 + 공 둘)이고 재질은 식물 재질 묶음(툰)에서 받아 정원 조명·밤을
 * 그대로 따른다. 구름 아래 땅과 흙에는 그늘이 진다. 빗줄기는 `InstancedMesh` 하나(지오메트리·재질 하나)로
 * 그리고, 매 프레임 미리 만든 행렬만 고쳐 쓴다 (할당 없음).
 */

export const RAIN_KEY = "rain";

const DROP_COLOR = "#8DB8DE";
const CLOUD_LIGHT = "#EEF2F5";
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

/**
 * 구름 조각 — 단순한 도형만 쓴다. 공: `["ball", x, y, z, 반지름]`, 가로로 누운 알약(캡슐):
 * `["pill", x, y, z, 반지름, 가운데 길이]` (전체 폭 = 길이 + 반지름 × 2).
 */
type CloudPart =
  | readonly ["ball", number, number, number, number]
  | readonly ["pill", number, number, number, number, number];

/** 구름: 누운 알약 하나 위에 큰 공(왼쪽)과 작은 공(오른쪽, 큰 공에 붙여 조금 높게). */
const CLOUD_PARTS: readonly CloudPart[] = [
  ["pill", 0, 0, 0, 0.15, 0.62],
  ["ball", -0.08, 0.13, 0, 0.24],
  ["ball", 0.19, 0.12, 0, 0.16],
];

/** 구름 그늘 색 (푸른 회색) — 비가 셀수록 진하다. */
const CLOUD_SHADOW_RGB = "34,44,64";
const SHADOW_MIN_OPACITY = 0.6;
const SHADOW_MAX_OPACITY = 1;

/**
 * 구름 그늘: 땅(화분 둘레)과 흙 위에 눕힌 둥근 그림자 두 장. 가운데가 진하고 가장자리로 사라지는 텍스처
 * 하나·재질 하나를 같이 쓴다.
 */
function createCloudShade(rain: number, soilY: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const c2d = canvas.getContext("2d");
  if (c2d) {
    const gradient = c2d.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, `rgba(${CLOUD_SHADOW_RGB},0.7)`);
    gradient.addColorStop(0.55, `rgba(${CLOUD_SHADOW_RGB},0.45)`);
    gradient.addColorStop(1, `rgba(${CLOUD_SHADOW_RGB},0)`);
    c2d.fillStyle = gradient;
    c2d.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: SHADOW_MIN_OPACITY + (SHADOW_MAX_OPACITY - SHADOW_MIN_OPACITY) * Math.min(1, rain),
  });
  const geometry = new THREE.PlaneGeometry(1, 1);
  const group = new THREE.Group();
  // 땅: 화분 둘레까지 넓게. 흙: 화분 안 흙 표면만.
  for (const [y, size] of [
    [0.006, 1.9],
    [soilY, 1.0],
  ] as const) {
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y;
    plane.scale.set(size, size, 1);
    plane.renderOrder = 1;
    plane.raycast = () => {};
    group.add(plane);
  }
  return {
    object: group,
    dispose() {
      texture.dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}

/**
 * @param rain 0~1. 0 이면 만들지 않는다 (null).
 * @param height 식물 꼭대기 높이 (화분 바닥 기준) — 구름이 그 위에 뜬다.
 * @param cloudMaterial 구름 재질 (식물 재질 묶음이 만들고 치운다).
 * @param soilY 화분 흙 표면 높이 — 구름 그늘을 흙 위에도 눕힌다.
 */
export function createRain(
  rain: number,
  height: number,
  seed: number,
  cloudMaterial: (color: THREE.ColorRepresentation) => THREE.Material,
  soilY = 0.6
): Rain | null {
  const look = rainLook(rain);
  if (!look) return null;
  const group = new THREE.Group();
  group.userData[RAIN_KEY] = true;
  const top = height + CLOUD_GAP;

  // 공은 지오메트리 하나를 크기만 바꿔 쓰고, 알약은 끝이 찌그러지지 않게 조각마다 만든다.
  const ballGeometry = new THREE.SphereGeometry(1, 18, 12);
  const geometries: THREE.BufferGeometry[] = [ballGeometry];
  const cloud = new THREE.Group();
  const material = cloudMaterial(look.cloudColor);
  for (const part of CLOUD_PARTS) {
    const [kind, x, y, z, radius] = part;
    let mesh: THREE.Mesh;
    if (kind === "ball") {
      mesh = new THREE.Mesh(ballGeometry, material);
      mesh.scale.setScalar(radius);
    } else {
      const pill = new THREE.CapsuleGeometry(radius, part[5], 8, 18).rotateZ(Math.PI / 2);
      geometries.push(pill);
      mesh = new THREE.Mesh(pill, material);
    }
    mesh.position.set(x, y, z);
    mesh.raycast = () => {};
    cloud.add(mesh);
  }
  cloud.position.set(-0.04, top, 0.1);
  group.add(cloud);
  // 구름 아래는 그늘이 진다 (땅과 흙 위).
  const shade = createCloudShade(rain, soilY);
  group.add(shade.object);

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
      for (const geometry of geometries) geometry.dispose();
      shade.dispose();
      dropGeometry.dispose();
      dropMaterial.dispose();
      drops.dispose();
    },
  };
  rain3d.update(0);
  return rain3d;
}
