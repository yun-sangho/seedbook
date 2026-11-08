"use client";

import { useEffect, useMemo } from "react";
import { useStockPriceStore } from "../stores/stock-price-store";
import type { StockHolding } from "../types/types";
import { isPriceFresh } from "./stock-price-cache";

export interface StockPricePoint {
  close: number;
  date: string; // YYYY-MM-DD (DB 상의 실제 가격 일자)
}

export interface UseStockPricesResult {
  prices: Map<string, StockPricePoint>;
  /** 아직 한 번도 받은 적 없는 시세를 기다리는 중. ("..." 표시용) */
  isLoading: boolean;
  /** 만료된 캐시 갱신까지 포함해 서버 응답을 기다리는 중. (값 확정이 필요한 동기화용) */
  isFetching: boolean;
  error: Error | null;
}

export const stockPriceKey = (market: string, ticker: string) => `${market}:${ticker}`;

/**
 * 보유 종목 목록의 최신 시세를 전역 캐시 (`useStockPriceStore`) 에서 읽는다.
 *
 * - 캐시된 값은 첫 렌더부터 바로 돌려준다 (화면 전환 시 깜빡임 없음).
 * - 캐시에 없거나 만료된 종목만 서버에 요청한다.
 * - 시장/티커가 비어있는 레거시 holdings 는 자동으로 제외한다.
 */
export function useStockPrices(holdings: StockHolding[]): UseStockPricesResult {
  // holdings 객체 자체는 매 렌더마다 새 참조이므로, 시장/티커 키만 직렬화해
  // 실제로 의미있는 변화가 있을 때만 재계산되게 한다.
  const itemsKey = useMemo(
    () =>
      holdings
        .filter((h) => h.market && h.ticker)
        .map((h) => stockPriceKey(h.market, h.ticker))
        .sort()
        .join(","),
    [holdings]
  );
  const keys = useMemo(() => (itemsKey.length === 0 ? [] : itemsKey.split(",")), [itemsKey]);

  const ensurePrices = useStockPriceStore((s) => s.ensurePrices);
  const entries = useStockPriceStore((s) => s.entries);
  const inFlight = useStockPriceStore((s) => s.inFlight);
  const errors = useStockPriceStore((s) => s.errors);

  useEffect(() => {
    if (keys.length > 0) ensurePrices(keys);
  }, [keys, ensurePrices]);

  const prices = useMemo(() => {
    const next = new Map<string, StockPricePoint>();
    for (const key of keys) {
      const point = entries[key]?.point;
      if (point) next.set(key, point);
    }
    return next;
  }, [keys, entries]);

  // 첫 렌더 (effect 가 요청을 걸기 전) 에도 상태가 맞도록 캐시 상태로 판정한다.
  const now = Date.now();
  const isLoading = keys.some((key) => !entries[key] && !errors[key]);
  const isFetching = keys.some(
    (key) => inFlight[key] || (!isPriceFresh(entries[key], now) && !errors[key])
  );

  const errorMessage = keys.map((key) => errors[key]).find(Boolean) ?? null;
  const error = useMemo(() => (errorMessage ? new Error(errorMessage) : null), [errorMessage]);

  return { prices, isLoading, isFetching, error };
}
