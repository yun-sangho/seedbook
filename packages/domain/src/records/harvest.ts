import { defineRecord } from "../define-record";
import { f, shape } from "../fields";
import { uuidv5 } from "../uuid-v5";
import { MAX_PLANT_STAGE, PLANT_KINDS, plantGoalShape } from "./portfolio";

/** 수확한 식물이 나타내는 것. 지금은 포트폴리오뿐 (적금 등이 늘면 값을 더한다 — open enum 이라 확장). */
export const HARVEST_SOURCE_TYPES = ["portfolio"] as const;

/** 한 수확 주기의 목표 수 — 단계 목표 넷 (`goalHistory`) + 열매 목표 하나 (`fruitGoal`). */
export const SEASON_GOAL_COUNT = MAX_PLANT_STAGE + 1;

/**
 * 수확 기록 (`harvest`). 열매 목표까지 이룬 수확 주기 하나. 식물의 주인(`sourceType` — 지금은 포트폴리오)을
 * 지워도 남도록 부모 없이 그 id·이름을 함께 보관한다 (`sourceId` 는 참조가 아니라 기록, 리밸런싱과 같다).
 *
 * id 는 `harvestId(sourceId, season)` — 두 기기가 같은 열매를 수확해도 한 행이 된다.
 */
export const harvest = defineRecord({
  type: "harvest",
  table: "plant_harvest",
  key: { kind: "uuid" },
  sortable: true,
  fields: {
    sourceType: f.enum(HARVEST_SOURCE_TYPES, { default: "portfolio" }),
    sourceId: f.text(),
    sourceName: f.text(),
    season: f.int({ min: 1 }),
    plantKind: f.enum(PLANT_KINDS),
    wish: f.text({ default: "" }),
    goals: f.json(shape.list(plantGoalShape, { maxItems: SEASON_GOAL_COUNT })),
    harvestedAt: f.timestamp(),
    /** 소원을 "했어요" 로 표시한 시각. */
    doneAt: f.timestamp({ nullable: true, default: null }),
  },
});

/** 수확 기록 id = uuidv5(식물 주인 id, `season:<수확 주기 번호>`). 주인 id 는 UUID 여야 한다. */
export function harvestId(sourceId: string, season: number): string {
  return uuidv5(sourceId, `season:${season}`);
}
