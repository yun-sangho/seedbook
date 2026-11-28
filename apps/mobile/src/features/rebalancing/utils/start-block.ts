import {
  type StockPricePoint,
  stockPriceKey,
} from "@mobile/features/investments/utils/use-stock-prices";

/**
 * 시세를 모르는 이유.
 * - `loading`: 아직 한 번도 받지 못해 기다리는 중
 * - `failed`: 요청이 실패함 (연결 문제 등) — 다시 확인하면 될 수 있다
 * - `missing`: 서버에도 시세가 없음 (상장폐지 등) — 다시 확인해도 계속 모를 수 있다
 */
export type UnpricedReason = "loading" | "failed" | "missing";

export interface UnpricedStock {
  /** `market:ticker` */
  key: string;
  name: string;
  reason: UnpricedReason;
}

/** 시세 캐시(`useStockPriceStore`)에서 판정에 쓰는 부분. */
export interface PriceCacheState {
  entries: Record<string, { point: StockPricePoint | null; fetchedAt: number } | undefined>;
  errors: Record<string, string | undefined>;
}

/**
 * 시세를 모르는 포트폴리오 종목 (같은 종목은 한 번만). 시세를 모르면 보유해도 0원으로 계산돼
 * 권장 매매가 틀린다. 갱신에 실패했어도 예전에 받은 시세가 있으면 아는 것으로 본다.
 */
export function findUnpricedStocks(
  stocks: readonly { market: string; ticker: string; name: string }[],
  cache: PriceCacheState
): UnpricedStock[] {
  const byKey = new Map<string, UnpricedStock>();
  for (const { market, ticker, name } of stocks) {
    const key = stockPriceKey(market, ticker);
    const reason = unpricedReason(market && ticker ? key : null, cache);
    if (reason) byKey.set(key, { key, name: name || ticker || "(미선택)", reason });
  }
  return [...byKey.values()];
}

/** 시세를 알면 null. `key` 가 null 이면 종목을 고르지 않은 항목이라 시세를 요청하지 않는다. */
function unpricedReason(key: string | null, cache: PriceCacheState): UnpricedReason | null {
  if (key === null) return "missing";
  const entry = cache.entries[key];
  if (entry?.point && entry.point.close > 0) return null;
  if (cache.errors[key]) return "failed";
  return entry ? "missing" : "loading";
}

/** 새 리밸런싱을 시작할 수 없는 이유. */
export type RebalancingStartBlock =
  | "outside-holdings"
  | "prices-missing"
  | "prices-failed"
  | "prices-loading"
  | "no-trades";

/**
 * 새 리밸런싱을 막는 이유. 시작할 수 있으면 null. 이유가 여럿이면 사용자가 손봐야 하는 것을
 * 먼저 알린다 (기다리면 되는 것은 뒤로).
 */
export function rebalancingStartBlock({
  hasOutsideHoldings,
  unpriced,
  taskCount,
}: {
  hasOutsideHoldings: boolean;
  unpriced: readonly UnpricedStock[];
  taskCount: number;
}): RebalancingStartBlock | null {
  if (hasOutsideHoldings) return "outside-holdings";
  if (unpriced.some((s) => s.reason === "missing")) return "prices-missing";
  if (unpriced.some((s) => s.reason === "failed")) return "prices-failed";
  if (unpriced.length > 0) return "prices-loading";
  return taskCount === 0 ? "no-trades" : null;
}
