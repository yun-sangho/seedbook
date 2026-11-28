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

/** 소원 이력에 남기는 최근 소원 수. 늘리는 것은 확장, 줄이는 것은 깨는 변경 (옛 앱 값을 거부). */
export const PLANT_WISH_HISTORY_MAX = 20;

/**
 * 정한 소원 하나 (`wishHistory` 항목). 빈 `wish` 는 소원을 지운 것. `at` 이 null 이면 이력이 생기기 전에 정한
 * 소원이라 정한 때를 모른다.
 */
export const plantWishShape = shape.object({
  wish: f.text(),
  at: f.timestamp({ nullable: true }),
});

/** 소원 이력 — 씨앗을 심을 때와 고칠 때마다 하나씩, 오래된 순, 최근 `PLANT_WISH_HISTORY_MAX` 개. */
export const plantWishHistoryShape = shape.list(plantWishShape, {
  maxItems: PLANT_WISH_HISTORY_MAX,
});

/**
 * 포트폴리오 (`portfolio`). 연결된 계좌는 `account.portfolioId` 가 정한다.
 *
 * - `driftMode` 기본값은 방식이 생기기 전의 판정(%p 차이)인 `absolute` 다. 새 포트폴리오는 앱이
 *   `relative` 를 보낸다.
 * - 식물 (`season`·`plantKind`·`plantName`·`wish`·`wishHistory`·`goalAmount`·`growthStage`·`goalHistory`·
 *   `fruitGoal`·`stageGoals`) 은 모드 전환 병합에서만 묶어서 고른다 (§5.5). 한 수확 주기는 목표 다섯 개 — 넷은 `goalHistory` (단계 1~4), 다섯 번째
 *   (열매) 는 `fruitGoal` 이다. 옛 앱이 자기 정의(`maxItems: 4`)로 받은 레코드를 격리하지 않도록
 *   `goalHistory` 를 늘리지 않는다.
 * - `plantKind` 가 null 이면 화면이 포트폴리오 id 해시로 종류를 정한다 (식물 종류가 생기기 전 모양).
 * - `plantName` 은 씨앗을 심을 때 정하는 식물 이름 (비우면 포트폴리오 이름만 보인다). `wishHistory` 의 마지막
 *   항목이 지금 `wish` 다 (식물 이름·소원 이력이 생기기 전에 정한 소원은 이력이 비어 있다). 수확하면 둘 다 비운다.
 * - `stageGoals` 는 씨앗을 심을 때 정한 최종 목표까지의 단계 목표 다섯 개 (새싹·묘목·나무·꽃·열매, 마지막이
 *   최종 목표). 처음엔 간격이 좁고 갈수록 넓다. `goalAmount` 는 그대로 "다음 단계 목표" 라 옛 앱도 그 뜻으로
 *   자라게 한다 — 새 앱은 비워진 `goalAmount` 를 `stageGoals[growthStage]` 로 다시 채운다. 비어 있으면 단계마다
 *   목표를 정하던 예전 식물이다. `stageBase` 는 단계 목표를 나눈 출발 금액 (심을 때의 평가금액) — 단계와 막대는
 *   이 금액 뒤로 늘어난 만큼이다.
 * - `driftSince` 는 비중 이탈을 처음 본 시각 (KST 날짜 시작). 수확과 무관하다.
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
    plantName: f.text({ default: "" }),
    wishHistory: f.json(plantWishHistoryShape, { default: [] }),
    fruitGoal: f.json(plantGoalShape, { nullable: true, default: null }),
    stageGoals: f.json(shape.list(f.money({ min: 1 }), { maxItems: MAX_PLANT_STAGE + 1 }), {
      default: [],
    }),
    stageBase: f.money({ nullable: true, default: null, min: 0 }),
    driftSince: f.timestamp({ nullable: true, default: null }),
  },
});
