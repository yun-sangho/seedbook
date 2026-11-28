import * as THREE from "three";

/**
 * 바람 줄기: 식물 옆을 가로질러 지나가는 가는 곡선 몇 가닥. 바람이 셀수록 많고 빠르고 진하다. 몸통이 눕는
 * 쪽(-X)으로 분다. 지오메트리 하나를 모든 가닥이 같이 쓰고, 가닥마다 재질이 따로라 투명도로 나타났다 사라진다.
 * 매 프레임은 위치·크기·투명도만 바꾼다 (할당 없음).
 */

export const WIND_STREAK_KEY = "windStreak";

const COLOR = "#7FAED3";
const MAX_OPACITY = 0.85;
/** 바람 1 일 때 가닥 수. 바람이 약하면 줄어든다 (최소 1). */
const MAX_STREAKS = 5;
/** 가닥이 지나가는 가로 범위 (식물 중심 기준). */
const TRAVEL = 1.5;

export interface WindStreaks {
  object: THREE.Object3D;
  update(time: number): void;
  dispose(): void;
}

function streakGeometry(): THREE.BufferGeometry {
  // 왼쪽(-X, 바람이 가는 쪽) 끝이 살짝 말려 올라가는 곡선.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.45, 0, 0),
    new THREE.Vector3(0.15, 0.03, 0),
    new THREE.Vector3(-0.15, -0.01, 0),
    new THREE.Vector3(-0.36, 0.02, 0),
    new THREE.Vector3(-0.43, 0.08, 0),
    new THREE.Vector3(-0.38, 0.12, 0),
  ]);
  return new THREE.TubeGeometry(curve, 24, 0.014, 4, false);
}

/**
 * @param wind 0~1. 0 이면 만들지 않는다 (null).
 * @param height 식물 높이 (화분 바닥 기준) — 가닥이 지나가는 높이 범위.
 */
export function createWindStreaks(wind: number, height: number, seed: number): WindStreaks | null {
  if (wind <= 0) return null;
  const strength = Math.min(1, wind * 2); // 화면 데이터의 바람은 0.5 까지라 0.5 에서 가장 세게 보인다.
  const count = Math.max(1, Math.round(MAX_STREAKS * strength));
  const geometry = streakGeometry();
  const group = new THREE.Group();
  const period = 2.6 - strength * 1.1; // 한 가닥이 지나가는 시간 (초)
  const streaks = Array.from({ length: count }, (_, i) => {
    const material = new THREE.MeshBasicMaterial({
      color: COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData[WIND_STREAK_KEY] = true;
    // 식물을 누를 때 바람 줄기에 걸리지 않게 한다.
    mesh.raycast = () => {};
    mesh.renderOrder = 2;
    // 가닥마다 높이·앞뒤·길이·출발 시각을 고르게 나눈다 (시드로 조금 흔든다).
    const jitter = ((seed * 9301 + i * 49297) % 233280) / 233280;
    const y = 0.95 + ((i + 0.5) / count) * Math.max(height - 0.85, 0.35) + (jitter - 0.5) * 0.15;
    const z = 0.35 + (i % 2) * 0.25 - jitter * 0.1;
    const length = 0.8 + jitter * 0.5;
    group.add(mesh);
    return { mesh, material, y, z, length, offset: i / count + jitter * 0.3 };
  });

  return {
    object: group,
    update(time) {
      for (const streak of streaks) {
        const p = (((time / period + streak.offset) % 1) + 1) % 1;
        streak.mesh.position.set(
          TRAVEL - p * TRAVEL * 2,
          streak.y + Math.sin(p * Math.PI * 2) * 0.04,
          streak.z
        );
        streak.mesh.scale.set(streak.length * (0.7 + 0.3 * Math.sin(p * Math.PI)), 1, 1);
        // 가운데에서 가장 진하고 양 끝에서 사라진다.
        streak.material.opacity = Math.sin(p * Math.PI) ** 2 * MAX_OPACITY * (0.5 + strength * 0.5);
      }
    },
    dispose() {
      geometry.dispose();
      for (const streak of streaks) streak.material.dispose();
    },
  };
}
