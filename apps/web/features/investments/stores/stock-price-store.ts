"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { selectKeysToFetch, type CachedPrice } from "../utils/stock-price-cache";

/**
 * 앱 전역 시세 캐시.
 *
 * - 서버에서 한 번 받은 시세는 `market:ticker` 단위로 localStorage 에 남긴다.
 *   화면이 바뀌어도 첫 렌더부터 캐시 값을 그대로 쓴다.
 * - `ensurePrices` 는 캐시에 없거나 만료된 key 만 서버에 묻는다. 같은 틱에 여러
 *   컴포넌트가 부르면 한 번의 요청으로 묶는다.
 * - 시세는 사용자 데이터가 아니라 공용 데이터라서 hybrid(cloud) 저장소가 아닌
 *   localStorage 에 직접 둔다. 동기 storage 라 store 생성 시점에 바로 복원되므로
 *   HydrationGate 대상도 아니다.
 */

interface PriceApiResponse {
  prices: Array<{ market: string; ticker: string; date: string; close: number }>;
}

interface StockPriceState {
  entries: Record<string, CachedPrice>;
  /** 현재 요청 중인 key. 영속화하지 않는다. */
  inFlight: Record<string, true>;
  /** 마지막 요청이 실패한 key → 메시지. 영속화하지 않는다. */
  errors: Record<string, string>;
  ensurePrices: (keys: readonly string[]) => void;
}

// 같은 커밋에서 여러 effect 가 부르는 요청을 한 번에 보내기 위한 큐.
const queued = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function omitKeys<T>(record: Record<string, T>, keys: readonly string[]): Record<string, T> {
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
}

function toQueryItem(key: string) {
  const [market = "", ticker = ""] = key.split(":");
  return { market, ticker };
}

async function requestPrices(keys: string[]): Promise<PriceApiResponse> {
  const res = await fetch("/api/stocks/prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: keys.map(toQueryItem) }),
  });
  if (!res.ok) throw new Error(`prices failed: ${res.status}`);
  return (await res.json()) as PriceApiResponse;
}

export const useStockPriceStore = create<StockPriceState>()(
  persist(
    (set, get) => {
      const flush = async () => {
        flushTimer = null;
        const keys = [...queued];
        queued.clear();
        if (keys.length === 0) return;

        try {
          const data = await requestPrices(keys);
          const fetchedAt = Date.now();
          const received = new Map(
            data.prices.map((p) => [`${p.market}:${p.ticker}`, { close: p.close, date: p.date }])
          );
          const entries = { ...get().entries };
          for (const key of keys) {
            // 서버가 돌려주지 않은 key 는 "시세 없음" 으로 캐시한다.
            entries[key] = { point: received.get(key) ?? null, fetchedAt };
          }
          set({ entries, inFlight: omitKeys(get().inFlight, keys) });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const errors = { ...get().errors };
          for (const key of keys) errors[key] = message;
          // 실패해도 기존 캐시 값은 그대로 둔다.
          set({ errors, inFlight: omitKeys(get().inFlight, keys) });
        }
      };

      return {
        entries: {},
        inFlight: {},
        errors: {},
        ensurePrices: (keys) => {
          const { entries, inFlight, errors } = get();
          const busy = new Set([...Object.keys(inFlight), ...queued]);
          const toFetch = selectKeysToFetch(keys, entries, busy, Date.now());
          if (toFetch.length === 0) return;

          const nextInFlight = { ...inFlight };
          for (const key of toFetch) {
            queued.add(key);
            nextInFlight[key] = true;
          }
          set({ inFlight: nextInFlight, errors: omitKeys(errors, toFetch) });

          if (flushTimer === null) flushTimer = setTimeout(() => void flush(), 0);
        },
      };
    },
    {
      name: "stock-price-cache",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ entries: state.entries }),
    }
  )
);

/** 테스트 전용: 캐시와 대기 큐를 비운다. */
export function __resetStockPriceStoreForTests(): void {
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = null;
  queued.clear();
  useStockPriceStore.setState({ entries: {}, inFlight: {}, errors: {} });
}
