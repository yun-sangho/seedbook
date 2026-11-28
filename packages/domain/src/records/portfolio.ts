import { defineRecord } from "../define-record";
import { f, shape } from "../fields";

export const DRIFT_MODES = ["relative", "absolute"] as const;

/** 포트폴리오 식물의 마지막 성장 단계 (씨앗 0 → 꽃·열매 4). */
export const MAX_PLANT_STAGE = 4;

/**
 * 포트폴리오 (`portfolio`). 연결된 계좌는 `account.portfolioId` 가 정한다.
 *
 * - `driftMode` 기본값은 방식이 생기기 전의 판정(%p 차이)인 `absolute` 다. 새 포트폴리오는 앱이
 *   `relative` 를 보낸다.
 * - 식물 (`goalAmount`·`growthStage`·`goalHistory`) 은 모드 전환 병합에서만 묶어서 고른다 (§5.5).
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
    goalHistory: f.json(
      shape.list(shape.object({ amount: f.money({ min: 1 }), reachedAt: f.timestamp() }), {
        maxItems: MAX_PLANT_STAGE,
      }),
      { default: [] }
    ),
  },
});
