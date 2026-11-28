import { listOf, finiteNumber as num, text } from "@web/lib/sync/normalize-values";
import { LEGACY_DRIFT_MODE } from "../types/constants";
import type { DriftMode, PortfolioItem } from "../types/types";
import { readPlantProgress } from "./portfolio-plant";

// 방식이 없는 데이터는 방식이 생기기 전에 저장된 것 — 그때처럼 %p 차이로 판정한다.
const driftMode = (value: unknown): DriftMode =>
  value === "relative" || value === "absolute" ? value : LEGACY_DRIFT_MODE;

type Allocation = PortfolioItem["allocations"][number];

const normalizeAllocation = (a: Allocation): Allocation => ({
  ...a,
  id: text(a.id),
  market: text(a.market),
  ticker: text(a.ticker),
  name: text(a.name),
  currency: text(a.currency),
  targetPercent: num(a.targetPercent),
});

/** 저장 전 값 정리 — 레코드 정의가 받는 값으로. 모르는 필드는 남긴다. */
export function normalizePortfolio(item: PortfolioItem): PortfolioItem {
  return {
    ...item,
    name: text(item.name),
    color: text(item.color),
    note: text(item.note),
    accountIds: listOf(item.accountIds).filter((id) => typeof id === "string"),
    driftMode: driftMode(item.driftMode),
    // 정의는 음수를 받지 않는다.
    driftThresholdPercent: Math.max(0, num(item.driftThresholdPercent)),
    ...readPlantProgress(item),
    allocations: listOf(item.allocations).map(normalizeAllocation),
  };
}
