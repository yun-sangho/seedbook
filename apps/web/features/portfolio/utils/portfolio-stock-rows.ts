import type { InvestmentItem } from "@web/features/investments/types/types";
import {
  type StockPricePoint,
  stockPriceKey,
} from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioAllocation } from "../types/types";
import { computeActualAllocation } from "./compute-actual-allocation";

export interface PortfolioStockRow {
  key: string;
  market: string;
  ticker: string;
  name: string;
  /** 연결 계좌 전체의 평가금액 합 (원). 시세가 없으면 0 */
  value: number;
  /** 연결 계좌 주식 평가금액 합 대비 비중 (%) */
  percent: number;
  /** 포트폴리오 목표 비중 (%). 목표에 없는 보유 종목이면 null */
  targetPercent: number | null;
}

/**
 * 포트폴리오 현황의 종목별 행. 목표 종목과 연결 계좌의 보유 종목을 합쳐
 * 평가금액이 큰 순으로 돌려준다 (같은 금액이면 목표 종목 순서 → 보유 순서).
 */
export function portfolioStockRows(
  allocations: PortfolioAllocation[],
  accounts: InvestmentItem[],
  prices: Map<string, StockPricePoint>
): PortfolioStockRow[] {
  const actual = computeActualAllocation(accounts, prices);
  const rows = new Map<string, PortfolioStockRow>();

  const add = (market: string, ticker: string, name: string, targetPercent: number | null) => {
    const key = stockPriceKey(market, ticker);
    if (rows.has(key)) return;
    const held = actual.perStock.get(key);
    rows.set(key, {
      key,
      market,
      ticker,
      name,
      value: held?.value ?? 0,
      percent: held?.percent ?? 0,
      targetPercent,
    });
  };

  for (const a of allocations) {
    if (a.market && a.ticker) add(a.market, a.ticker, a.name, a.targetPercent);
  }
  for (const inv of accounts) {
    for (const h of inv.holdings ?? []) {
      if (h.market && h.ticker && h.quantity > 0) add(h.market, h.ticker, h.name, null);
    }
  }

  return [...rows.values()].sort((a, b) => b.value - a.value);
}
