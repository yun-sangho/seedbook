"use client";

import { useMemo } from "react";
import type { InvestmentItem } from "../types/types";
import { withLiveValues } from "./live-account-value";
import { useStockPrices } from "./use-stock-prices";

/**
 * 계좌들의 `currentValue` 를 지금 시세로 다시 계산한 목록 (표시용 — 저장하지 않는다).
 * 목록·합계가 계좌 상세와 같은 금액을 보이도록 쓴다.
 */
export function useLiveAccounts(accounts: InvestmentItem[]): InvestmentItem[] {
  const holdings = useMemo(() => accounts.flatMap((inv) => inv.holdings ?? []), [accounts]);
  const { prices } = useStockPrices(holdings);
  return useMemo(() => withLiveValues(accounts, prices), [accounts, prices]);
}
