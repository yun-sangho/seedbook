import type { Stock } from "@web/features/investments/types/stock";
import type { InvestmentItem } from "@web/features/investments/types/types";
import {
  type StockPricePoint,
  stockPriceKey,
} from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "../types/types";
import { computeActualAllocation } from "./compute-actual-allocation";

/** 다른 포트폴리오 / 계좌에서 가져올 수 있는 종목 한 줄. */
export interface AllocationImportCandidate {
  /** `${market}:${ticker}` */
  key: string;
  stock: Stock;
  /** 가져올 때 미리 채울 목표 비중 (%) */
  targetPercent: number;
  /** 대상 포트폴리오에 이미 있는 종목 */
  alreadyAdded: boolean;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 다른 포트폴리오의 종목을 목표 비중 그대로 가져온다. 종목 미선택 행은 제외. */
export function candidatesFromPortfolio(
  source: PortfolioItem,
  existingKeys: Set<string>
): AllocationImportCandidate[] {
  return source.allocations
    .filter((a) => a.market && a.ticker)
    .map((a) => {
      const key = stockPriceKey(a.market, a.ticker);
      return {
        key,
        stock: { market: a.market, ticker: a.ticker, name: a.name, currency: a.currency },
        targetPercent: a.targetPercent,
        alreadyAdded: existingKeys.has(key),
      };
    });
}

/**
 * 계좌 보유 종목을 가져온다. 비중은 계좌 안의 현재 평가 비중(0.1% 반올림)으로 채우고,
 * 시세가 없으면 0%. 레거시(market/ticker 없음)·수량 0 보유는 제외.
 */
export function candidatesFromAccount(
  source: InvestmentItem,
  prices: Map<string, StockPricePoint>,
  existingKeys: Set<string>
): AllocationImportCandidate[] {
  const actual = computeActualAllocation([source], prices);
  const seen = new Set<string>();
  const candidates: AllocationImportCandidate[] = [];

  for (const h of source.holdings ?? []) {
    if (!h.market || !h.ticker || !h.quantity || h.quantity <= 0) continue;
    const key = stockPriceKey(h.market, h.ticker);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      key,
      stock: { market: h.market, ticker: h.ticker, name: h.name, currency: h.currency },
      targetPercent: roundToTenth(actual.perStock.get(key)?.percent ?? 0),
      alreadyAdded: existingKeys.has(key),
    });
  }
  return candidates;
}
