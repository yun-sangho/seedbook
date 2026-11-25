"use client";

import { createDeviceStateStorage } from "@web/lib/device-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type CachedPrice, selectKeysToFetch } from "../utils/stock-price-cache";
import type { StockPricePoint } from "../utils/use-stock-prices";

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
  prices: Array<{ market: string; ticker: string } & StockPricePoint>;
}

interface StockPriceState {
  entries: Record<string, CachedPrice>;
  /** 현재 요청 중인 key. 영속화하지 않는다. */
  inFlight: Record<string, true>;
  /** 마지막 요청이 실패한 key → 메시지. 영속화하지 않는다. */
  errors: Record<string, string>;
  ensurePrices: (keys: readonly string[]) => void;
  /** 캐시가 신선해도 ("시세 없음" 포함) 다시 묻는다. 사용자가 직접 다시 확인할 때 쓴다. */
  refreshPrices: (keys: readonly string[]) => void;
}

/** 이보다 오래 답이 없으면 실패로 본다 — "불러오는 중" 에 갇히지 않고 다시 확인할 수 있게. */
export const PRICE_REQUEST_TIMEOUT_MS = 15 * 1000;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRICE_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("/api/stocks/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: keys.map(toQueryItem) }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`prices failed: ${res.status}`);
    return (await res.json()) as PriceApiResponse;
  } finally {
    clearTimeout(timer);
  }
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
            data.prices.map((p) => [
              `${p.market}:${p.ticker}`,
              {
                close: p.close,
                date: p.date,
                asOf: p.asOf,
                kind: p.kind,
                securityType: p.securityType ?? null,
              },
            ])
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

      const enqueue = (toFetch: string[]) => {
        if (toFetch.length === 0) return;
        const { inFlight, errors } = get();
        const nextInFlight = { ...inFlight };
        for (const key of toFetch) {
          queued.add(key);
          nextInFlight[key] = true;
        }
        set({ inFlight: nextInFlight, errors: omitKeys(errors, toFetch) });

        if (flushTimer === null) flushTimer = setTimeout(() => void flush(), 0);
      };

      const busyKeys = () => new Set([...Object.keys(get().inFlight), ...queued]);

      return {
        entries: {},
        inFlight: {},
        errors: {},
        ensurePrices: (keys) =>
          enqueue(selectKeysToFetch(keys, get().entries, busyKeys(), Date.now())),
        // 빈 캐시로 고르면 요청 중인 것만 빠진다.
        refreshPrices: (keys) => enqueue(selectKeysToFetch(keys, {}, busyKeys(), Date.now())),
      };
    },
    {
      name: "stock-price-cache",
      storage: createJSONStorage(() => createDeviceStateStorage()),
      version: 2,
      partialize: (state) => ({ entries: state.entries }),
      // v1 항목에는 가격 기준 시각 (asOf/kind) 이 없다. 공용 시세 캐시라 버리고 다시 받는다.
      migrate: (persisted, version) =>
        version < 2 ? { entries: {} } : (persisted as { entries: Record<string, CachedPrice> }),
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
