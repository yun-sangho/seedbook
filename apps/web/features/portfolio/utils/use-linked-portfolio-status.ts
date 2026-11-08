"use client";

import { useCallback, useMemo } from "react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import { usePortfolioStore } from "../stores/portfolio-store";
import { linkedPortfolioStatus, type LinkedPortfolioStatus } from "./linked-portfolio-status";

/**
 * 계좌 id → 연결된 포트폴리오 상태 (없으면 `null`) 조회 함수를 돌려준다.
 * 여러 계좌를 한 화면에서 판정하므로 전체 보유의 시세를 한 번에 받는다.
 */
export function useLinkedPortfolioStatus(): (accountId: string) => LinkedPortfolioStatus | null {
  const investments = useInvestmentStore((s) => s.investments);
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const allHoldings = useMemo(
    () => investments.flatMap((inv) => inv.holdings ?? []),
    [investments]
  );
  const { prices } = useStockPrices(allHoldings);

  return useCallback(
    (accountId: string) => linkedPortfolioStatus(accountId, portfolios, investments, prices),
    [portfolios, investments, prices]
  );
}
