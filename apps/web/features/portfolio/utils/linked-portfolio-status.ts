import type { InvestmentItem } from "@web/features/investments/types/types";
import type { StockPricePoint } from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "../types/types";
import { computeActualAllocation } from "./compute-actual-allocation";
import { computeDriftAlert } from "./compute-drift-alert";
import { computeRebalancingGap } from "./compute-rebalancing-gap";

export type LinkedPortfolioState = "needs-rebalancing" | "ok" | "unknown";

export interface LinkedPortfolioStatus {
  portfolioId: string;
  name: string;
  color: string;
  /**
   * - `needs-rebalancing`: 목표 대비 |차이| 가 임계값을 넘는 종목이 있음
   * - `ok`: 임계값 이내
   * - `unknown`: 목표 종목이 없거나 시세 있는 보유·예수금이 없어 판단 불가
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
 * 리밸런싱 대상은 계좌다 — 포트폴리오가 여러 계좌에 연결돼 있어도 이 계좌의
 * 보유와 예수금(목표 0원)으로 목표 비중 대비 이격을 판정한다 (모바일 리밸런싱 탭과 같은 기준).
 * 리밸런싱이 필요한 포트폴리오가 먼저 오도록 정렬한다.
 */
export function linkedPortfolioStatuses(
  accountId: string,
  portfolios: PortfolioItem[],
  investments: InvestmentItem[],
  prices: Map<string, StockPricePoint>
): LinkedPortfolioStatus[] {
  const account = investments.find((inv) => inv.id === accountId);
  const accountScope = account ? [account] : [];
  const actual = computeActualAllocation(accountScope, prices);
  // 예수금도 리밸런싱 대상이다 (목표 0원 — 모두 목표 비중대로 투자).
  const cashBalance = sumCash(account);

  return portfolios
    .filter((p) => p.accountIds.includes(accountId))
    .map((p): LinkedPortfolioStatus => {
      const base = { portfolioId: p.id, name: p.name, color: p.color };

      if (p.allocations.length === 0 || actual.totalStockValue + cashBalance === 0) {
        return { ...base, state: "unknown", breachedCount: 0, maxAbsGapPercent: 0 };
      }

      const summary = computeRebalancingGap(
        p.allocations,
        actual.perStock,
        actual.totalStockValue,
        0,
        { cashBalance }
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

/** 계좌의 예수금 합계 (원). 모든 현금 항목을 더한다. */
export function sumCash(account: InvestmentItem | undefined): number {
  return (account?.cashItems ?? []).reduce((sum, c) => sum + (c.amount || 0), 0);
}
