import { gardenLayout } from "@mobile/features/garden/plant-3d/garden-layout";
import type { PlantOptions } from "@mobile/features/garden/plant-3d/plant-options";
import type { PlantSlot } from "@mobile/features/garden/plant-3d/plant-renderer";

/**
 * 소개 페이지에 띄우는 데모 정원. 정지 이미지(`public/landing/<scene>-{light,dark}.webp`)는 이 장면을
 * 2배율로 캡처해 1000×770 으로 줄인 것이라, 식물을 바꾸면 라이트·다크 이미지를 다시 캡처한다.
 */
export const LANDING_GARDEN_PLANTS = {
  /** 히어로: 다 자란 나무, 리밸런싱이 필요해 기운 나무, 자라는 중인 묘목. */
  garden: [
    {
      stage: "sapling",
      rain: 0,
      wilt: 0,
      ripe: false,
      needsRebalance: false,
      pot: "lavender",
      seed: 11,
    },
    { stage: "bloom", rain: 0, wilt: 0, ripe: true, needsRebalance: false, pot: "sun", seed: 7 },
    { stage: "tree", rain: 0, wilt: 0, ripe: false, needsRebalance: true, pot: "sky", seed: 3 },
  ],
  /** 리밸런싱: 목표 비중 안의 나무와 벗어나 기운 나무. */
  rebalance: [
    {
      stage: "tree",
      rain: 0,
      wilt: 0,
      ripe: false,
      needsRebalance: false,
      pot: "terracotta",
      seed: 5,
    },
    { stage: "tree", rain: 0, wilt: 0, ripe: false, needsRebalance: true, pot: "cream", seed: 5 },
  ],
} as const satisfies Record<string, readonly PlantOptions[]>;

export type LandingGardenScene = keyof typeof LANDING_GARDEN_PLANTS;

/** 받침 판 양 끝과 기운 나무의 잎이 잘리지 않게 카메라를 조금 물린다 (정원 폭에 더하는 값). */
const LAYOUT_MARGIN = 1.2;

/** 장면의 식물을 정원 자리에 놓는다. `width` 는 `GardenCanvas` 의 `layoutWidth`. */
export function landingGardenSlots(scene: LandingGardenScene): {
  slots: PlantSlot[];
  width: number;
} {
  const plants = LANDING_GARDEN_PLANTS[scene];
  const layout = gardenLayout(plants.length);
  return {
    slots: plants.map((options, index) => {
      const spot = layout.spots[index] ?? { x: 0, z: 0 };
      return { id: `${scene}-${index}`, options, x: spot.x, z: spot.z };
    }),
    width: layout.width + LAYOUT_MARGIN,
  };
}

export interface GardenEnvironment {
  /** `prefers-reduced-motion: reduce` */
  reducedMotion: boolean;
  /** 데이터 절약 모드 (`navigator.connection.saveData`) */
  saveData: boolean;
  /** WebGL 컨텍스트를 만들 수 있는지 */
  webgl: boolean;
}

/** 3D 정원을 받을지. 아니면 같은 장면의 정지 이미지를 그대로 둔다. */
export function shouldLoad3d(environment: GardenEnvironment): boolean {
  return environment.webgl && !environment.reducedMotion && !environment.saveData;
}
