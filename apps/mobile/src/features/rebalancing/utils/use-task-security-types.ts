"use client";

import { useCallback, useMemo } from "react";
import type { StockHolding } from "@mobile/features/investments/types/types";
import type { SecurityType } from "@mobile/features/investments/utils/krx-tick-size";
import { stockPriceKey, useStockPrices } from "@mobile/features/investments/utils/use-stock-prices";
import type { RebalancingTask } from "../types/types";

/**
 * 리밸런싱 매매 종목의 종류 ("stock" | "etf" | "etn" …). 시세 API 가 함께 내려준다 — 받기 전이나
 * 모르는 종목이면 null. 호가 단위를 정할 때 쓴다.
 */
export function useTaskSecurityTypes(
  tasks: RebalancingTask[]
): (task: RebalancingTask) => SecurityType {
  const holdings = useMemo<StockHolding[]>(
    () =>
      tasks.map((task) => ({
        id: task.id,
        market: task.market,
        ticker: task.ticker,
        name: task.name,
        currency: "KRW",
        quantity: 0,
        memo: "",
      })),
    [tasks]
  );
  const { prices } = useStockPrices(holdings);
  return useCallback(
    (task) => prices.get(stockPriceKey(task.market, task.ticker))?.securityType ?? null,
    [prices]
  );
}
