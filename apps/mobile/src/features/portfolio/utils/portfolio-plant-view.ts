import { plantKindOf } from "@mobile/features/garden/utils/garden-home";
import type { InvestmentItem } from "@mobile/features/investments/types/types";
import type { StockPricePoint } from "@mobile/features/investments/utils/use-stock-prices";
import type { PlantKind, PortfolioItem } from "../types/types";
import { type LinkedPortfolioState, linkedPortfolioStatus } from "./linked-portfolio-status";
import { computePlantStatus, type PlantEvaluation, type PlantStatus } from "./plant-season";
import { computePortfolioValuation } from "./portfolio-plant";

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
  /** 식물 종류 (고른 종류, 없으면 `kindForPortfolio`). */
  kind: PlantKind;
  /** 수확 주기 번호 (1부터, 수확할 때마다 +1). 화면에 보이지 않는 내부 번호. */
  season: number;
  /** 씨앗을 심을 때 정한 식물 이름 (비어 있을 수 있다). */
  plantName: string;
  /** 목표를 이루면 하고 싶은 일 (비어 있을 수 있다). */
  wish: string;
  /** 소원 이력 (오래된 순). */
  wishHistory: PortfolioItem["wishHistory"];
  /** 포트폴리오 평가 금액 (원). */
  value: number;
  /** 연결 계좌의 종목 시세가 모두 왔는지. */
  pricesComplete: boolean;
  rebalancing: LinkedPortfolioState;
}

/** 포트폴리오 하나의 평가 — 평가금액·시세가 다 왔는지·비중 이탈 (리밸런싱이 필요한 연결 계좌가 있는지). */
export function portfolioPlantEvaluation(
  portfolio: PortfolioItem,
  investments: InvestmentItem[],
  prices: Map<string, StockPricePoint>
): PlantEvaluation & { rebalancing: LinkedPortfolioState; accountCount: number } {
  const valuation = computePortfolioValuation(portfolio, investments, prices);
  const rebalancing = portfolioRebalancingState(portfolio, investments, prices);
  // 연결 계좌가 없거나 목표 비중이 비면 `unknown` — 이탈로 보지 않는다 (금액만으로 자란다).
  return {
    value: valuation.value,
    pricesComplete: valuation.pricesComplete,
    drifting: rebalancing === "needs-rebalancing",
    rebalancing,
    accountCount: valuation.accountCount,
  };
}

/** `now` 는 이탈 기간을 재는 시각 (ISO). */
export function portfolioPlantView(
  portfolio: PortfolioItem,
  investments: InvestmentItem[],
  prices: Map<string, StockPricePoint>,
  now: string
): PortfolioPlantView {
  const { rebalancing, accountCount, ...evaluation } = portfolioPlantEvaluation(
    portfolio,
    investments,
    prices
  );
  const status = computePlantStatus(portfolio, evaluation, now);
  return {
    portfolioId: portfolio.id,
    name: portfolio.name,
    color: portfolio.color,
    kind: plantKindOf(portfolio),
    season: portfolio.season,
    plantName: portfolio.plantName,
    wish: portfolio.wish,
    wishHistory: portfolio.wishHistory,
    value: evaluation.value,
    pricesComplete: evaluation.pricesComplete,
    ...status,
    // 연결 계좌가 없으면 평가금액이 0 일 뿐 시장이 내린 것이 아니다.
    wind: accountCount > 0 ? status.wind : 0,
    rebalancing,
  };
}
