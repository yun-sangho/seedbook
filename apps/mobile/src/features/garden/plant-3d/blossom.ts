import * as THREE from "three";
import { wiltSag } from "./plant-options";

/**
 * 4단계(꽃·열매)의 꽃과 열매. 나무·고사리가 같은 모양을 쓴다 — 종류가 달라도 "꽃 = 4단계, 열매 = 수확할 수
 * 있음" 이 한눈에 같게 읽히도록. 지오메트리·재질은 식물 하나에서 한 번만 만들어 모든 꽃·열매가 같이 쓴다.
 */

const COLORS = {
  petal: "#F8B3CB",
  petalWilted: "#C9B6A6",
  petalCenter: "#FFD66B",
  fruit: "#E8664F",
  fruitWilted: "#B07A5E",
} as const;

export const FRUIT_RADIUS = 0.085;
const PETAL_COUNT = 5;
const PETAL_RING = 0.08;

const UP = new THREE.Vector3(0, 1, 0);

export interface Blossoms {
  /** `normal` 쪽을 보고 피는 꽃 하나를 `parent` 에 단다. */
  addFlower(parent: THREE.Object3D, position: THREE.Vector3, normal: THREE.Vector3): void;
  /** 열매 하나를 `parent` 에 단다 (시들면 조금 처진다). */
  addFruit(parent: THREE.Object3D, position: THREE.Vector3): void;
}

/**
 * @param material 색 → 재질 (같은 색이면 같은 재질을 돌려주는 캐시면 더 좋다).
 * @param track 다 쓰면 dispose 할 지오메트리로 등록한다.
 */
export function createBlossoms(
  wilt: number,
  material: (color: THREE.Color) => THREE.Material,
  track: (geometry: THREE.BufferGeometry) => void
): Blossoms {
  const petalGeo = new THREE.SphereGeometry(0.075, 20, 14);
  const centerGeo = new THREE.SphereGeometry(0.05, 20, 14);
  const fruitGeo = new THREE.SphereGeometry(FRUIT_RADIUS, 20, 14);
  track(petalGeo);
  track(centerGeo);
  track(fruitGeo);
  const petalMat = material(
    new THREE.Color(COLORS.petal).lerp(new THREE.Color(COLORS.petalWilted), clamp01(wilt * 0.6))
  );
  const centerMat = material(new THREE.Color(COLORS.petalCenter));
  const fruitMat = material(
    new THREE.Color(COLORS.fruit).lerp(new THREE.Color(COLORS.fruitWilted), clamp01(wilt * 0.5))
  );
  const sag = wiltSag(wilt);
  const flowerScale = 1 - sag * 0.25;

  return {
    addFlower(parent, position, normal) {
      const flower = new THREE.Group();
      flower.position.copy(position);
      flower.quaternion.setFromUnitVectors(UP, normal);
      for (let p = 0; p < PETAL_COUNT; p++) {
        const petal = new THREE.Mesh(petalGeo, petalMat);
        const a = (p / PETAL_COUNT) * Math.PI * 2;
        petal.position.set(Math.cos(a) * PETAL_RING, 0, Math.sin(a) * PETAL_RING);
        petal.scale.set(1, 0.45, 1);
        flower.add(petal);
      }
      const center = new THREE.Mesh(centerGeo, centerMat);
      center.position.y = 0.02;
      flower.add(center);
      flower.scale.setScalar(flowerScale);
      parent.add(flower);
    },
    addFruit(parent, position) {
      const fruit = new THREE.Mesh(fruitGeo, fruitMat);
      fruit.position.copy(position);
      fruit.position.y -= sag * 0.05;
      parent.add(fruit);
    },
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
