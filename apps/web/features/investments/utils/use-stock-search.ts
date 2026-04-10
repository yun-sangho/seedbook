"use client";

import { useEffect, useRef, useState } from "react";
import type { Stock, StockSearchResponse } from "../types/stock";

const DEBOUNCE_MS = 200;

export interface UseStockSearchResult {
  results: Stock[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * 주식 종목 검색 훅.
 *
 * - 입력 쿼리를 200ms debounce 한 뒤 `/api/stocks/search` 를 호출한다.
 * - AbortController 로 구 요청을 취소해 레이스 컨디션을 방지한다.
 * - 네트워크 오류 시 빈 배열로 폴백한다 (콤보박스 UX 유지).
 * - 빈 쿼리는 즉시 빈 결과로 리셋한다.
 */
export function useStockSearch(query: string): UseStockSearchResult {
  const [results, setResults] = useState<Stock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const timer = setTimeout(() => {
      const url = `/api/stocks/search?q=${encodeURIComponent(query)}`;
      fetch(url, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`search failed: ${res.status}`);
          return (await res.json()) as StockSearchResponse;
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          setResults(data.results);
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof Error && err.name === "AbortError") return;
          setResults([]);
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { results, isLoading, error };
}
