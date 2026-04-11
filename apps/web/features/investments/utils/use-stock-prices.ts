"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StockHolding } from "../types/types";

export interface StockPricePoint {
  close: number;
  date: string; // YYYY-MM-DD (DB 상의 실제 가격 일자)
}

export interface UseStockPricesResult {
  prices: Map<string, StockPricePoint>;
  isLoading: boolean;
  error: Error | null;
}

const DEBOUNCE_MS = 150;

export const stockPriceKey = (market: string, ticker: string) => `${market}:${ticker}`;

interface PriceApiResponse {
  prices: Array<{ market: string; ticker: string; date: string; close: number }>;
}

/**
 * 보유 종목 목록의 최신 시세를 일괄 조회한다.
 *
 * - DB 상의 가장 최근 일자 값을 가져온다.
 * - 시장/티커가 비어있는 레거시 holdings 는 자동으로 제외한다.
 * - holdings 가 바뀌면 이전 요청을 abort 하고 다시 부른다.
 */
export function useStockPrices(holdings: StockHolding[]): UseStockPricesResult {
  const [prices, setPrices] = useState<Map<string, StockPricePoint>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // holdings 객체 자체는 매 렌더마다 새 참조이므로, 시장/티커 키만 직렬화해
  // 실제로 의미있는 변화가 있을 때만 effect 가 재실행되게 한다.
  const itemsKey = useMemo(
    () =>
      holdings
        .filter((h) => h.market && h.ticker)
        .map((h) => stockPriceKey(h.market, h.ticker))
        .sort()
        .join(","),
    [holdings]
  );

  useEffect(() => {
    if (itemsKey.length === 0) {
      setPrices(new Map());
      setIsLoading(false);
      setError(null);
      return;
    }

    const items = itemsKey.split(",").map((key) => {
      const [market = "", ticker = ""] = key.split(":");
      return { market, ticker };
    });

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const timer = setTimeout(() => {
      fetch("/api/stocks/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ items }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`prices failed: ${res.status}`);
          return (await res.json()) as PriceApiResponse;
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          const next = new Map<string, StockPricePoint>();
          for (const p of data.prices) {
            next.set(stockPriceKey(p.market, p.ticker), { close: p.close, date: p.date });
          }
          setPrices(next);
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof Error && err.name === "AbortError") return;
          setPrices(new Map());
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [itemsKey]);

  return { prices, isLoading, error };
}
