"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useInvestmentStore } from "../stores/investment-store";
import type { InvestmentItem } from "../types/types";
import { computeAccountValuation } from "./compute-account-valuation";
import { sortHoldings } from "./sort-holdings";
import { useStockPrices } from "./use-stock-prices";

/**
 * 투자 계좌 하나의 시세 기반 평가액 + currentValue 동기화.
 *
 * 보유주식/현금이 바뀌면 호출측이 `markHistoryDirty()` 를 부른다. 시세 로딩이
 * 끝나고 모든 종목 시세가 준비된 뒤에만 `onSyncCurrentValue(totalValue)` 를 호출해,
 * 잘못된 0 원/부분 합으로 currentValue (및 오늘자 히스토리) 를 덮어쓰지 않는다.
 *
 * 데스크탑 카드와 모바일 화면이 같은 규칙을 쓰도록 공유한다.
 */
export function useAccountValuation(
  item: InvestmentItem,
  {
    readOnly,
    onSyncCurrentValue,
  }: { readOnly: boolean; onSyncCurrentValue: (totalValue: number) => void }
) {
  const [pendingHistorySync, setPendingHistorySync] = useState(false);
  const holdingsSortOption = useInvestmentStore((state) => state.holdingsSortOption);

  const holdings = useMemo(() => item.holdings ?? [], [item.holdings]);
  const cashItems = useMemo(() => item.cashItems ?? [], [item.cashItems]);

  const { prices, isLoading: pricesLoading, isFetching: pricesFetching } = useStockPrices(holdings);

  const valuation = useMemo(
    () => computeAccountValuation(holdings, cashItems, prices),
    [holdings, cashItems, prices]
  );

  // 가격 정보가 없는 종목은 항상 맨 뒤로 밀어 순서가 흔들리는 것을 방지한다.
  const sortedHoldings = useMemo(
    () => sortHoldings(holdings, prices, holdingsSortOption),
    [holdings, prices, holdingsSortOption]
  );

  const { totalValue, allHoldingsHavePrices } = valuation;

  useEffect(() => {
    if (readOnly) return;
    if (!pendingHistorySync) return;
    // 만료된 캐시를 갱신 중이면 새 시세가 온 뒤에 동기화한다.
    if (pricesFetching) return;
    if (!allHoldingsHavePrices) return;
    onSyncCurrentValue(totalValue);
    setPendingHistorySync(false);
  }, [
    readOnly,
    pendingHistorySync,
    pricesFetching,
    allHoldingsHavePrices,
    totalValue,
    onSyncCurrentValue,
  ]);

  const markHistoryDirty = useCallback(() => setPendingHistorySync(true), []);

  return {
    ...valuation,
    holdings,
    cashItems,
    sortedHoldings,
    prices,
    pricesLoading,
    markHistoryDirty,
  };
}
