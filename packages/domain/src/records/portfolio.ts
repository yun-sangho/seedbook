import { defineRecord } from "../define-record";
import { f, shape } from "../fields";

export const DRIFT_MODES = ["relative", "absolute"] as const;

/** 포트폴리오 식물의 마지막 성장 단계 (씨앗 0 → 꽃 4). 열매는 단계가 아니라 `fruitGoal` 이다. */
export const MAX_PLANT_STAGE = 4;

/** 식물 종류. `tree` 는 나무, `fern` 은 보스턴고사리 (둘 다 4단계 꽃 → 열매). 값 추가는 확장 (open enum). */
export const PLANT_KINDS = ["tree", "fern"] as const;

/** 달성한 목표 하나 (`goalHistory` 항목·`fruitGoal`·수확 기록의 목표). */
export const plantGoalShape = shape.object({
  amount: f.money({ min: 1 }),
  reachedAt: f.timestamp(),
});

/**
 * 포트폴리오 (`portfolio`). 연결된 계좌는 `account.portfolioId` 가 정한다.
 *
 * - `driftMode` 기본값은 방식이 생기기 전의 판정(%p 차이)인 `absolute` 다. 새 포트폴리오는 앱이
 *   `relative` 를 보낸다.
 * - 식물 (`season`·`plantKind`·`wish`·`goalAmount`·`growthStage`·`goalHistory`·`fruitGoal`) 은 모드 전환
 *   병합에서만 묶어서 고른다 (§5.5). 한 계절은 목표 다섯 개 — 넷은 `goalHistory` (단계 1~4), 다섯 번째
 *   (열매) 는 `fruitGoal` 이다. 옛 앱이 자기 정의(`maxItems: 4`)로 받은 레코드를 격리하지 않도록
 *   `goalHistory` 를 늘리지 않는다.
 * - `plantKind` 가 null 이면 화면이 포트폴리오 id 해시로 종류를 정한다 (식물 종류가 생기기 전 모양).
 * - `driftSince` 는 비중 이탈을 처음 본 시각 (KST 날짜 시작). 계절과 무관하다.
 */
export const portfolio = defineRecord({
  type: "portfolio",
  table: "portfolio",
  key: { kind: "uuid" },
  sortable: true,
  fields: {
    name: f.text(),
    color: f.text(),
    note: f.text({ default: "" }),
    driftMode: f.enum(DRIFT_MODES, { default: "absolute" }),
    driftThresholdPercent: f.decimal({ min: 0, default: 5, normalize: ["finiteOrZero", "clamp"] }),
    goalAmount: f.money({ nullable: true, default: null, min: 1 }),
    growthStage: f.int({ min: 0, max: MAX_PLANT_STAGE, default: 0 }),
    goalHistory: f.json(shape.list(plantGoalShape, { maxItems: MAX_PLANT_STAGE }), {
      default: [],
    }),
    season: f.int({ min: 1, default: 1 }),
    plantKind: f.enum(PLANT_KINDS, { nullable: true, default: null }),
    wish: f.text({ default: "" }),
    fruitGoal: f.json(plantGoalShape, { nullable: true, default: null }),
    driftSince: f.timestamp({ nullable: true, default: null }),
  },
});
