import type { RecordValues } from "../define-record";
import type { PLANT_KINDS, portfolio } from "../records/portfolio";

/** 포트폴리오 식물의 성장 단계: 씨앗 0 → 새싹 1 → 묘목 2 → 나무 3 → 꽃 4. */
export type PlantStage = 0 | 1 | 2 | 3 | 4;

/** 식물 종류 (`PLANT_KINDS`). */
export type PlantKind = (typeof PLANT_KINDS)[number];

type PortfolioValues = RecordValues<typeof portfolio>;

/** 달성한 목표 하나. `amount` 는 원, `reachedAt` 은 달성을 기록한 ISO 시각. */
export type PlantGoal = NonNullable<PortfolioValues["fruitGoal"]>;

/** 정한 소원 하나. `at` 이 null 이면 이력이 생기기 전에 정한 소원. */
export type PlantWish = PortfolioValues["wishHistory"][number];

/**
 * 포트폴리오 식물의 진행 (`portfolio` 레코드의 식물 필드). 한 수확 주기는 목표 다섯 개다 — 단계 목표
 * (`goalAmount`) 를 이룰 때마다 한 단계 자라 `goalHistory` 에 남고, 4단계에서 이룬 다섯 번째(열매)
 * 목표는 `fruitGoal` 에 남는다 (수확할 수 있다). 수확하면 `season`(수확 주기 번호, 화면에 보이지 않음)이 오르고 빈 화분부터 다시 시작한다. 도달한
 * 단계는 한 수확 주기 안에서 내려가지 않는다.
 */
export interface PlantProgress
  extends Pick<
    PortfolioValues,
    | "goalAmount"
    | "goalHistory"
    | "season"
    | "plantKind"
    | "plantName"
    | "wish"
    | "wishHistory"
    | "fruitGoal"
    | "driftSince"
  > {
  growthStage: PlantStage;
}

/** 꽃 — 단계 목표로 자랄 수 있는 마지막 단계. 그 뒤는 열매 목표다 (이루면 열매가 열리고 바로 수확). */
export const MAX_PLANT_STAGE: PlantStage = 4;
