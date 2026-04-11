/**
 * 네이버 금융 API 크롤러
 * - 전 종목 목록 + 종가: m.stock.naver.com/api/stocks/marketValue
 * - 개별 종목 일봉 OHLCV: api.stock.naver.com/chart/domestic/item
 */

import { kstDateStringCompact, kstMidnight } from "@seedbook/database";
import { logger } from "../logger.js";
import { fetchWithRetry } from "./http.js";

const HEADERS = { "User-Agent": "Mozilla/5.0" };
const PAGE_SIZE = 100;

// --- 전 종목 목록 + 당일 종가 ---

interface NaverStockListItem {
  itemCode: string;
  stockName: string;
  closePrice: string;
  accumulatedTradingVolume: string;
  marketValue: string;
  compareToPreviousClosePrice: string;
  stockExchangeType: { nameKor: string };
}

interface NaverMarketValueResponse {
  totalCount: number;
  stocks: NaverStockListItem[];
}

export interface StockListItem {
  market: string;
  ticker: string;
  name: string;
  currency: string;
}

export interface StockRef {
  market: string;
  ticker: string;
}

export interface StockPriceItem {
  stockMarket: string;
  stockTicker: string;
  date: Date;
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  volume: bigint;
  marketCap: bigint | null;
  change: bigint | null;
}

async function fetchMarketStocks(market: "KOSPI" | "KOSDAQ"): Promise<NaverStockListItem[]> {
  const allStocks: NaverStockListItem[] = [];
  let page = 1;
  // 방어적 상한: PAGE_SIZE=100 기준, KOSPI/KOSDAQ 합쳐도 3천 미만이므로 100페이지면
  // 충분하다. totalCount 가 비정상 값을 주거나 stocks 가 계속 꽉 차는
  // 경우 무한 루프를 막는다.
  const MAX_PAGES = 100;

  while (page <= MAX_PAGES) {
    const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${PAGE_SIZE}`;

    const resp = await fetchWithRetry(
      url,
      { headers: HEADERS },
      { label: `Naver ${market} p${page}` }
    );

    const data = (await resp.json()) as NaverMarketValueResponse;

    if (!data || !Array.isArray(data.stocks)) {
      throw new Error(`Naver ${market} p${page} 응답 포맷 이상: stocks 가 배열이 아님`);
    }

    allStocks.push(...data.stocks);

    const reachedTotal = typeof data.totalCount === "number" && allStocks.length >= data.totalCount;
    const shortPage = data.stocks.length < PAGE_SIZE;

    if (reachedTotal || shortPage) {
      break;
    }

    page++;

    // rate limit
    await sleep(200);
  }

  return allStocks;
}

export async function fetchAllStocks(): Promise<StockListItem[]> {
  logger.info("네이버 금융에서 전 종목 목록 조회 중...");

  // 한쪽 시장이 실패해도 다른 쪽 시장 데이터는 살린다.
  // (전체 reject 되면 상위 syncStockList 가 "아무것도 못 받았다" 로 판단해서
  // 전 종목을 비활성화하는 사고로 이어질 수 있다.)
  const [kospiResult, kosdaqResult] = await Promise.allSettled([
    fetchMarketStocks("KOSPI"),
    fetchMarketStocks("KOSDAQ"),
  ]);

  const kospi = kospiResult.status === "fulfilled" ? kospiResult.value : null;
  const kosdaq = kosdaqResult.status === "fulfilled" ? kosdaqResult.value : null;

  if (kospiResult.status === "rejected") {
    logger.error("KOSPI 목록 조회 실패", {
      error: String(kospiResult.reason),
    });
  }
  if (kosdaqResult.status === "rejected") {
    logger.error("KOSDAQ 목록 조회 실패", {
      error: String(kosdaqResult.reason),
    });
  }

  if (!kospi && !kosdaq) {
    throw new Error("KOSPI/KOSDAQ 모두 실패");
  }

  const stocks: StockListItem[] = [
    ...(kospi ?? []).map((s) => ({
      market: "KOSPI",
      ticker: s.itemCode,
      name: s.stockName,
      currency: "KRW",
    })),
    ...(kosdaq ?? []).map((s) => ({
      market: "KOSDAQ",
      ticker: s.itemCode,
      name: s.stockName,
      currency: "KRW",
    })),
  ];

  logger.info(
    `전 종목 목록 조회 완료: KOSPI ${kospi?.length ?? 0} + KOSDAQ ${kosdaq?.length ?? 0} = ${stocks.length}`
  );
  return stocks;
}

// --- 개별 종목 일봉 OHLCV ---

interface NaverChartItem {
  localDate: string;
  closePrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  accumulatedTradingVolume: number;
}

export async function fetchStockDailyPrice(
  ref: StockRef,
  date: Date
): Promise<StockPriceItem | null> {
  // 네이버 API 는 KST 기준 YYYYMMDD 를 원한다. 컨테이너 TZ 와 무관하게 KST 로 포맷.
  const dateStr = kstDateStringCompact(date);
  const url = `https://api.stock.naver.com/chart/domestic/item/${ref.ticker}/day?startDateTime=${dateStr}&endDateTime=${dateStr}`;

  try {
    const resp = await fetchWithRetry(
      url,
      { headers: HEADERS },
      {
        label: `Naver chart ${ref.market}:${ref.ticker}`,
        // 개별 종목은 2800+ 개이므로 재시도 횟수를 줄여 전체 시간을 제한한다.
        retries: 2,
        timeoutMs: 10_000,
      }
    );

    const data = (await resp.json()) as NaverChartItem[];
    if (!Array.isArray(data) || data.length === 0) return null;

    const item = data[0]!;
    return {
      stockMarket: ref.market,
      stockTicker: ref.ticker,
      // DB 에는 "해당 KST 거래일의 자정 (00:00 KST)" instant 를 canonical 값으로
      // 저장한다. 16:30 KST 에 호출되든 새벽에 호출되든 같은 거래일이면 같은
      // instant 가 되어야 unique index 가 중복을 정상 판정한다.
      date: kstMidnight(date),
      open: BigInt(Math.round(item.openPrice)),
      high: BigInt(Math.round(item.highPrice)),
      low: BigInt(Math.round(item.lowPrice)),
      close: BigInt(Math.round(item.closePrice)),
      volume: BigInt(Math.round(item.accumulatedTradingVolume)),
      marketCap: null,
      change: null,
    };
  } catch (err) {
    // 개별 종목 실패는 전체 배치를 중단시키지 않는다. 상위에서 카운트만 집계.
    logger.warn(`시세 조회 실패 ${ref.market}:${ref.ticker}`, {
      error: String(err),
    });
    return null;
  }
}

export async function fetchAllStockPrices(
  refs: StockRef[],
  date: Date,
  concurrency = 5
): Promise<StockPriceItem[]> {
  const results: StockPriceItem[] = [];
  const total = refs.length;
  let failures = 0;

  for (let i = 0; i < total; i += concurrency) {
    const batch = refs.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((ref) => fetchStockDailyPrice(ref, date)));

    for (const r of batchResults) {
      if (r) {
        results.push(r);
      } else {
        failures++;
      }
    }

    if (i % 500 === 0 && i > 0) {
      logger.info(`시세 수집 진행: ${i}/${total} (실패 ${failures})`);
    }

    // rate limit
    await sleep(100);
  }

  if (total > 0 && failures / total > 0.3) {
    logger.warn(
      `시세 수집 실패율이 높음: ${failures}/${total} (${((failures / total) * 100).toFixed(1)}%)`
    );
  }

  logger.info(`시세 수집 완료: 성공 ${results.length}, 실패 ${failures}, 총 ${total}`);

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
