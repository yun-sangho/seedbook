/**
 * 네이버 금융 API 크롤러
 * - 전 종목 목록 + 종가: m.stock.naver.com/api/stocks/marketValue
 * - 개별 종목 일봉 OHLCV: api.stock.naver.com/chart/domestic/item
 */

import { logger } from "../logger.js";

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
  id: string;
  name: string;
  market: string;
}

export interface StockPriceItem {
  stockId: string;
  date: Date;
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  volume: bigint;
  marketCap: bigint | null;
  change: bigint | null;
}

function parseCommaNumber(value: string): bigint {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "N/A" || cleaned === "-") return 0n;
  return BigInt(cleaned);
}

async function fetchMarketStocks(
  market: "KOSPI" | "KOSDAQ",
): Promise<NaverStockListItem[]> {
  const allStocks: NaverStockListItem[] = [];
  let page = 1;

  while (true) {
    const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${PAGE_SIZE}`;
    const resp = await fetch(url, { headers: HEADERS });

    if (!resp.ok) {
      throw new Error(`Naver API failed: ${resp.status} for ${market} page ${page}`);
    }

    const data = (await resp.json()) as NaverMarketValueResponse;
    allStocks.push(...data.stocks);

    if (allStocks.length >= data.totalCount || data.stocks.length < PAGE_SIZE) {
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

  const [kospi, kosdaq] = await Promise.all([
    fetchMarketStocks("KOSPI"),
    fetchMarketStocks("KOSDAQ"),
  ]);

  const stocks: StockListItem[] = [
    ...kospi.map((s) => ({
      id: s.itemCode,
      name: s.stockName,
      market: "KOSPI",
    })),
    ...kosdaq.map((s) => ({
      id: s.itemCode,
      name: s.stockName,
      market: "KOSDAQ",
    })),
  ];

  logger.info(`전 종목 목록 조회 완료: KOSPI ${kospi.length} + KOSDAQ ${kosdaq.length} = ${stocks.length}`);
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

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function fetchStockDailyPrice(
  stockId: string,
  date: Date,
): Promise<StockPriceItem | null> {
  const dateStr = formatDate(date);
  const url = `https://api.stock.naver.com/chart/domestic/item/${stockId}/day?startDateTime=${dateStr}&endDateTime=${dateStr}`;

  const resp = await fetch(url, { headers: HEADERS });
  if (!resp.ok) return null;

  const data = (await resp.json()) as NaverChartItem[];
  if (data.length === 0) return null;

  const item = data[0]!;
  return {
    stockId,
    date,
    open: BigInt(Math.round(item.openPrice)),
    high: BigInt(Math.round(item.highPrice)),
    low: BigInt(Math.round(item.lowPrice)),
    close: BigInt(Math.round(item.closePrice)),
    volume: BigInt(Math.round(item.accumulatedTradingVolume)),
    marketCap: null,
    change: null,
  };
}

export async function fetchAllStockPrices(
  stockIds: string[],
  date: Date,
  concurrency = 5,
): Promise<StockPriceItem[]> {
  const results: StockPriceItem[] = [];
  const total = stockIds.length;

  for (let i = 0; i < total; i += concurrency) {
    const batch = stockIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((id) => fetchStockDailyPrice(id, date)),
    );

    for (const r of batchResults) {
      if (r) results.push(r);
    }

    if (i % 500 === 0 && i > 0) {
      logger.info(`시세 수집 진행: ${i}/${total}`);
    }

    // rate limit
    await sleep(100);
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
