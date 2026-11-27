import type { InvestmentItem } from "@web/features/investments/types/types";
import type { StockPricePoint } from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "../types/types";
import { type LinkedPortfolioState, linkedPortfolioStatus } from "./linked-portfolio-status";
import { computePlantStatus, computePortfolioValuation, type PlantStatus } from "./portfolio-plant";

/**
 * 포트폴리오의 리밸런싱 필요 여부. 리밸런싱 대상은 계좌라 연결 계좌마다 계좌 화면과 같은 판정
 * (`linkedPortfolioStatus`) 을 하고 모은다 — 한 계좌라도 필요하면 `needs-rebalancing`, 판정한 계좌가
 * 모두 임계값 이내면 `ok`, 판정할 계좌가 없으면 `unknown`.
 */
export function portfolioRebalancingState(
  portfolio: PortfolioItem,
  investments: InvestmentItem[],
  prices: Map<string, StockPricePoint>
): LinkedPortfolioState {
  let state: LinkedPortfolioState = "unknown";
  for (const accountId of portfolio.accountIds) {
    if (!investments.some((inv) => inv.id === accountId)) continue;
    const status = linkedPortfolioStatus(accountId, [portfolio], investments, prices);
    if (status?.state === "needs-rebalancing") return "needs-rebalancing";
    if (status?.state === "ok") state = "ok";
  }
  return state;
}

/** 정원·아바타가 그리는 포트폴리오 식물 하나. */
export interface PortfolioPlantView extends PlantStatus {
  portfolioId: string;
  name: string;
  color: string;
  /** 포트폴리오 평가 금액 (원). */
  value: number;
  /** 연결 계좌의 종목 시세가 모두 왔는지. */
  pricesComplete: boolean;
  rebalancing: LinkedPortfolioState;
}

export function portfolioPlantView(
  portfolio: PortfolioItem,
  investments: InvestmentItem[],
  prices: Map<string, StockPricePoint>
): PortfolioPlantView {
  const valuation = computePortfolioValuation(portfolio, investments, prices);
  return {
    portfolioId: portfolio.id,
    name: portfolio.name,
    color: portfolio.color,
    value: valuation.value,
    pricesComplete: valuation.pricesComplete,
    ...computePlantStatus(portfolio, valuation),
    rebalancing: portfolioRebalancingState(portfolio, investments, prices),
  };
}
