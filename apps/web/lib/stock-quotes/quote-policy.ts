import { kstDateString, kstDayOfWeek } from "@seedbook/database";

/**
 * 시세 응답을 고르는 규칙 (서버 전용).
 *
 * - 일봉 종가 (`StockPrice`): 크롤러가 16:30 KST 에 확정값으로 저장.
 * - 현재가 (`StockQuote`): `/api/stocks/prices` 가 요청 시 네이버에서 받아 캐시.
 *
 * 응답에는 항상 "이 가격이 언제 값인지" (`asOf`) 를 붙여서 화면이 기준 시각을
 * 보여줄 수 있게 한다.
 */

export type PriceKind = "realtime" | "close";

export interface PricePoint {
  close: number;
  /** KST 거래일 (YYYY-MM-DD). */
  date: string;
  /** 가격 기준 시각 (ISO). 장중 = 마지막 체결 시각, 종가 = 해당일 15:30 KST. */
  asOf: string;
  kind: PriceKind;
}

export interface DailyClose {
  date: string;
  close: number;
}

export interface QuoteSnapshot {
  price: number;
  marketStatus: string;
  tradedAt: Date;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 장 시작 09:00 ~ 마감 15:30. 마감 직후 종가 확정분을 잡도록 10분 여유를 둔다.
const TRADING_START_MINUTE = 9 * 60;
const TRADING_END_MINUTE = 15 * 60 + 40;

/**
 * 장중에는 70초마다, 장외에는 30분마다 소스에서 새로 받는다.
 * 70초는 네이버 실시간 API 응답의 `pollingInterval` (네이버 증권 웹의 갱신 주기) 이다.
 */
export const QUOTE_TTL_TRADING_MS = 70 * 1000;
export const QUOTE_TTL_OFF_HOURS_MS = 30 * 60 * 1000;

const MARKET_STATUS_OPEN = "OPEN";

/** KST 기준 평일 09:00 ~ 15:40. 공휴일은 모른다 (그날은 소스가 CLOSE 를 준다). */
export function isKrxTradingHours(now: Date): boolean {
  const day = kstDayOfWeek(now);
  if (day === 0 || day === 6) return false;
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const minute = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return minute >= TRADING_START_MINUTE && minute < TRADING_END_MINUTE;
}

export function isQuoteStale(quote: { fetchedAt: Date } | null, now: Date): boolean {
  if (!quote) return true;
  const ttl = isKrxTradingHours(now) ? QUOTE_TTL_TRADING_MS : QUOTE_TTL_OFF_HOURS_MS;
  return now.getTime() - quote.fetchedAt.getTime() >= ttl;
}

/** 그 체결이 해당 거래일 정규장 마감 (15:30 KST) 이후인지. 개장 전 체결은 false. */
function hasClosed(tradedAt: Date): boolean {
  return tradedAt.toISOString() >= closeInstant(kstDateString(tradedAt));
}

function closeInstant(date: string): string {
  return new Date(`${date}T15:30:00+09:00`).toISOString();
}

function closePoint(date: string, close: number): PricePoint {
  return { close, date, asOf: closeInstant(date), kind: "close" };
}

/**
 * 일봉 종가와 현재가 중 더 최신인 쪽을 고른다.
 *
 * - 일봉이 더 최근 거래일이면 일봉 (멈춘 현재가 캐시보다 확정값이 낫다).
 * - 현재가가 장중 (OPEN) 이면 장중 가격, 기준 시각 = 마지막 체결 시각.
 * - 장 마감 현재가가 일봉보다 새 거래일이고 그날 15:30 이후 체결이면 그날 종가
 *   (15:30 ~ 16:30 수집 전 공백). 네이버는 마감 뒤에도 시간외 체결 시각을 주므로
 *   기준 시각은 15:30 으로 고정한다.
 * - 개장 전 (NXT 프리마켓 등) 체결은 장 마감 상태여도 오늘 종가가 아니다 — 일봉을 쓴다.
 * - 같은 거래일이면 확정된 일봉을 쓴다.
 */
export function pickPricePoint(
  daily: DailyClose | null,
  quote: QuoteSnapshot | null
): PricePoint | null {
  if (!quote) return daily ? closePoint(daily.date, daily.close) : null;

  const quoteDate = kstDateString(quote.tradedAt);
  if (daily && daily.date > quoteDate) return closePoint(daily.date, daily.close);

  if (quote.marketStatus === MARKET_STATUS_OPEN) {
    return {
      close: quote.price,
      date: quoteDate,
      asOf: quote.tradedAt.toISOString(),
      kind: "realtime",
    };
  }

  if (!daily) return closePoint(quoteDate, quote.price);
  if (quoteDate > daily.date && hasClosed(quote.tradedAt))
    return closePoint(quoteDate, quote.price);
  return closePoint(daily.date, daily.close);
}
