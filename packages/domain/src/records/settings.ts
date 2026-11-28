import { defineRecord } from "../define-record";
import { f } from "../fields";

export const HOLDINGS_SORT_OPTIONS = [
  "evalDesc",
  "evalAsc",
  "priceDesc",
  "priceAsc",
  "nameAsc",
  "nameDesc",
] as const;
export const REBALANCING_TASK_SORTS = ["nameDesc", "nameAsc", "evalDesc", "evalAsc"] as const;
export const REBALANCING_TASK_SECTIONS = ["pending", "ordered", "filled"] as const;
export const ACCOUNT_SORT_OPTIONS = ["evalDesc", "evalAsc"] as const;
export const PORTFOLIO_STOCK_SORT_OPTIONS = [
  "driftDesc",
  "evalDesc",
  "evalAsc",
  "nameAsc",
  "nameDesc",
] as const;
/**
 * 계정의 화면 설정 (`user_preference`, 사용자당 하나). 저장 모드(`storageMode`·
 * `storageModeChosenAt`) 는 동기화를 켜고 끄는 계정 상태라 레코드에 넣지 않는다 (사용자 결정
 * 2026-11-28).
 */
export const settings = defineRecord({
  type: "settings",
  table: "user_preference",
  key: { kind: "singleton" },
  fields: {
    holdingsSortOption: f.enum(HOLDINGS_SORT_OPTIONS, { default: "evalDesc" }),
    rebalancingTaskSort: f.enum(REBALANCING_TASK_SORTS, { default: "nameDesc" }),
    rebalancingCollapsedSections: f.enumList(REBALANCING_TASK_SECTIONS, { default: [] }),
    accountSortOption: f.enum(ACCOUNT_SORT_OPTIONS, { default: "evalDesc" }),
    portfolioStockSortOption: f.enum(PORTFOLIO_STOCK_SORT_OPTIONS, { default: "driftDesc" }),
  },
});
