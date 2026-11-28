import { stockPriceKey } from "./use-stock-prices";

/** 새 계좌에 미리 넣어 둘 보유 종목 (수량은 사용자가 이후 입력). */
export interface HoldingSeed {
  market: string;
  ticker: string;
  name: string;
  currency: string;
  quantity: number;
}

type StockLike = Pick<HoldingSeed, "market" | "ticker" | "name" | "currency">;

/**
 * 기존 계좌의 보유 종목이나 포트폴리오의 목표 종목으로부터 새 계좌의 종목
 * 목록을 만든다. 같은 주식을 두 계좌가 동시에 보유할 수는 없으므로 수량은 0 으로
 * 시작한다. 종목이 선택되지 않은 항목과 중복 종목은 제외한다.
 */
export function toHoldingSeeds(stocks: StockLike[]): HoldingSeed[] {
  const seen = new Set<string>();
  const seeds: HoldingSeed[] = [];
  for (const s of stocks) {
    if (!s.market || !s.ticker) continue;
    const key = stockPriceKey(s.market, s.ticker);
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({
      market: s.market,
      ticker: s.ticker,
      name: s.name,
      currency: s.currency,
      quantity: 0,
    });
  }
  return seeds;
}
