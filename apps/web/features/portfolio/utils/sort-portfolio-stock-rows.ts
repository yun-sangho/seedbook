import { sortByHoldingsOption } from "@web/features/investments/utils/sort-holdings";
import type { DriftMode } from "../types/types";
import { driftPercent } from "./drift-percent";
import type { PortfolioStockRow } from "./portfolio-stock-rows";

/** 포트폴리오 현황 "종목별" 정렬. 이 화면에서만 쓰고 저장하지 않는다. */
export type PortfolioStockSortOption =
  | "driftDesc"
  | "evalDesc"
  | "evalAsc"
  | "nameAsc"
  | "nameDesc";

export const DEFAULT_PORTFOLIO_STOCK_SORT_OPTION: PortfolioStockSortOption = "driftDesc";

/** 종목 행의 이격률. 목표에 없는 보유 종목은 목표 0% 로 본다 (→ 보유 비중이 그대로 이격). */
export function stockRowDrift(row: PortfolioStockRow, mode: DriftMode): number {
  return driftPercent({ targetPercent: row.targetPercent ?? 0, actualPercent: row.percent }, mode);
}

/**
 * 종목별 행을 정렬한 새 배열 (안정 정렬). 이격 큰 순은 방향(+/−)과 상관없이 |이격률| 이 큰 것부터.
 * 평가액·이름 순은 보유 종목 정렬과 같은 규칙(한국어 이름 순서)을 쓴다.
 */
export function sortPortfolioStockRows(
  rows: readonly PortfolioStockRow[],
  option: PortfolioStockSortOption,
  mode: DriftMode
): PortfolioStockRow[] {
  if (option === "driftDesc") {
    return [...rows].sort(
      (a, b) => Math.abs(stockRowDrift(b, mode)) - Math.abs(stockRowDrift(a, mode))
    );
  }
  return sortByHoldingsOption(rows, option, (row) => ({
    name: row.name || row.ticker,
    price: null,
    value: row.value,
  }));
}
