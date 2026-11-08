import type { StockPricePoint } from "./use-stock-prices";

/**
 * 캐시된 시세를 "신선하다" 고 보는 기간. 크롤러가 하루 두 번 (오전/오후) 가격을
 * 갱신하므로 1 시간이면 장중에도 충분히 최신에 가깝고, 화면 전환마다 서버를
 * 두드리지 않는다. 기간이 지난 값도 즉시 보여주고 백그라운드에서만 갱신한다.
 */
export const PRICE_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * `market:ticker` 하나에 대한 캐시 항목.
 * `point: null` 은 "서버에 이 종목 시세가 없음" 을 캐시한 것 — 매번 다시 묻지 않기 위함.
 */
export interface CachedPrice {
  point: StockPricePoint | null;
  fetchedAt: number;
}

export function isPriceFresh(entry: CachedPrice | undefined, now: number): boolean {
  if (!entry) return false;
  return now - entry.fetchedAt < PRICE_CACHE_TTL_MS;
}

/** 캐시에 없거나 만료됐고, 아직 요청 중이 아닌 key 만 (중복 없이) 고른다. */
export function selectKeysToFetch(
  keys: readonly string[],
  entries: Record<string, CachedPrice>,
  inFlight: ReadonlySet<string>,
  now: number
): string[] {
  const result = new Set<string>();
  for (const key of keys) {
    if (inFlight.has(key)) continue;
    if (isPriceFresh(entries[key], now)) continue;
    result.add(key);
  }
  return [...result];
}
