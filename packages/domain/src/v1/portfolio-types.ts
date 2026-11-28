/** 포트폴리오 식물의 성장 단계: 씨앗 0 → 새싹 1 → 묘목 2 → 나무 3 → 꽃·열매 4. */
export type PlantStage = 0 | 1 | 2 | 3 | 4;

/** 달성한 목표 하나. `amount` 는 원, `reachedAt` 은 달성을 기록한 ISO 시각. */
export interface PlantGoal {
  amount: number;
  reachedAt: string;
}

/**
 * 포트폴리오 식물의 진행. 지금 목표(`goalAmount`)를 달성하면 한 단계 자라고 목표는 비워진다 —
 * 사용자가 다음 목표를 새로 정한다 (최대 4번). 도달한 단계는 내려가지 않는다.
 */
export interface PlantProgress {
  /** 지금 목표 금액 (원). 정하지 않았거나 방금 달성했으면 null. */
  goalAmount: number | null;
  growthStage: PlantStage;
  /** 달성한 목표들 (오래된 순). */
  goalHistory: PlantGoal[];
}

/** 꽃·열매 — 식물이 다 자란 단계. 목표는 이만큼 달성할 수 있다. */
export const MAX_PLANT_STAGE: PlantStage = 4;
