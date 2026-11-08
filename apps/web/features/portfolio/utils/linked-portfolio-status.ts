import type { InvestmentItem } from "@web/features/investments/types/types";
import type { StockPricePoint } from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "../types/types";
import { computeActualAllocation } from "./compute-actual-allocation";
import { computeDriftAlert } from "./compute-drift-alert";
import { computeRebalancingGap } from "./compute-rebalancing-gap";
import { resolvePortfolioAccounts } from "./resolve-portfolio-accounts";

export type LinkedPortfolioState = "needs-rebalancing" | "ok" | "unknown";

export interface LinkedPortfolioStatus {
  portfolioId: string;
  name: string;
  color: string;
  /**
   * - `needs-rebalancing`: 목표 대비 |차이| 가 임계값을 넘는 종목이 있음
   * - `ok`: 임계값 이내
   * - `unknown`: 목표 종목이 없거나 시세 있는 보유가 없어 판단 불가
   */
  state: LinkedPortfolioState;
  breachedCount: number;
  maxAbsGapPercent: number;
}

const STATE_ORDER: Record<LinkedPortfolioState, number> = {
  "needs-rebalancing": 0,
  ok: 1,
  unknown: 2,
};

/**
 * 한 투자 계좌에 연결된 포트폴리오들과 각각의 리밸런싱 필요 여부.
 *
 * 판정은 포트폴리오 목록의 이격 배지와 같은 기준 — 포트폴리오에 연결된 모든
 * 계좌의 보유를 합산해 계산한다. 그래야 두 화면의 표시가 어긋나지 않는다.
 * 리밸런싱이 필요한 포트폴리오가 먼저 오도록 정렬한다.
 */
export function linkedPortfolioStatuses(
  accountId: string,
  portfolios: PortfolioItem[],
  investments: InvestmentItem[],
  prices: Map<string, StockPricePoint>
): LinkedPortfolioStatus[] {
  return portfolios
    .filter((p) => p.accountIds.includes(accountId))
    .map((p): LinkedPortfolioStatus => {
      const actual = computeActualAllocation(resolvePortfolioAccounts(p, investments), prices);
      const base = { portfolioId: p.id, name: p.name, color: p.color };

      if (p.allocations.length === 0 || actual.totalStockValue === 0) {
        return { ...base, state: "unknown", breachedCount: 0, maxAbsGapPercent: 0 };
      }

      const summary = computeRebalancingGap(
        p.allocations,
        actual.perStock,
        actual.totalStockValue,
        0
      );
      const drift = computeDriftAlert(summary, p.driftThresholdPercent);
      return {
        ...base,
        state: drift.hasBreach ? "needs-rebalancing" : "ok",
        breachedCount: drift.breachedRows.length,
        maxAbsGapPercent: drift.maxAbsGapPercent,
      };
    })
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
}
