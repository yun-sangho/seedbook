/**
 * 종목 종류. 크롤러가 네이버 `stockEndType` 을 그대로 저장한다 ("stock" | "etf" | "etn" …).
 * 크롤러가 아직 종류를 채우지 않은 종목이면 null.
 */
export type SecurityType = string | null | undefined;

/** 일반 주식 호가 단위 (KRX, 2023-01 개편 · 코스피/코스닥 공통). [미만 가격, 단위] */
const STOCK_TICKS: ReadonlyArray<readonly [number, number]> = [
  [2_000, 1],
  [5_000, 5],
  [20_000, 10],
  [50_000, 50],
  [200_000, 100],
  [500_000, 500],
];
const STOCK_TOP_TICK = 1_000;

/** ETF·ETN 은 2,000원 미만 1원, 이상 5원. */
const FUND_TICK_BOUNDARY = 2_000;

/**
 * 가격대의 호가 단위 (원). 종류를 모르면 null — 단위를 맞추지 않는다.
 */
export function tickSize(price: number, type: SecurityType): number | null {
  if (type === "etf" || type === "etn") return price < FUND_TICK_BOUNDARY ? 1 : 5;
  if (type === "stock") {
    for (const [below, tick] of STOCK_TICKS) if (price < below) return tick;
    return STOCK_TOP_TICK;
  }
  return null;
}

/** 가장 가까운 호가로 맞춘다. 종류를 모르면 그대로. */
export function snapToTick(price: number, type: SecurityType): number {
  const tick = tickSize(price, type);
  if (tick === null) return price;
  return Math.max(tick, Math.round(price / tick) * tick);
}

/**
 * 한 호가 올리거나 내린다. 호가에 맞지 않는 값이면 먼저 맞춘 뒤 움직인다.
 * 내릴 때는 바로 아래 가격대의 단위를 쓴다 (주식 20,000원 → 19,990원). 1호가 아래로는 내려가지 않는다.
 * 종류를 모르면 1원씩 움직인다.
 */
export function stepByTick(price: number, direction: 1 | -1, type: SecurityType): number {
  if (tickSize(price, type) === null) return Math.max(1, price + direction);
  const current = snapToTick(price, type);
  if (direction === 1) return current + (tickSize(current, type) ?? 1);
  const below = current - (tickSize(current - 1, type) ?? 1);
  return Math.max(tickSize(1, type) ?? 1, below);
}
