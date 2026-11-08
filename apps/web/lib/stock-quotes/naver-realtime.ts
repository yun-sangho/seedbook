/**
 * 네이버 금융 실시간 시세 (비공식 polling API).
 * `GET https://polling.finance.naver.com/api/realtime/domestic/stock/<code>,<code>,...`
 *
 * 비공식 API 라 언제든 바뀔 수 있다. 실패는 호출측이 삼키고 기존 캐시/일봉으로
 * 대체한다 — 응답 포맷이 이상하면 해당 종목만 건너뛴다.
 */

export interface RealtimeQuote {
  ticker: string;
  price: number;
  marketStatus: string;
  tradedAt: Date;
}

const ENDPOINT = "https://polling.finance.naver.com/api/realtime/domestic/stock";
const HEADERS = { "User-Agent": "Mozilla/5.0" };
/** 한 요청에 묶는 종목 수. URL 길이와 응답 크기를 적당히 제한한다. */
const MAX_CODES_PER_REQUEST = 50;

interface NaverRealtimeItem {
  itemCode?: unknown;
  closePriceRaw?: unknown;
  marketStatus?: unknown;
  localTradedAt?: unknown;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

function parseItem(item: NaverRealtimeItem): RealtimeQuote | null {
  if (typeof item.itemCode !== "string" || item.itemCode.length === 0) return null;
  if (typeof item.marketStatus !== "string") return null;

  const price = Number(item.closePriceRaw);
  if (!Number.isFinite(price) || price <= 0) return null;

  if (typeof item.localTradedAt !== "string") return null;
  const tradedAt = new Date(item.localTradedAt);
  if (Number.isNaN(tradedAt.getTime())) return null;

  return { ticker: item.itemCode, price, marketStatus: item.marketStatus, tradedAt };
}

export function parseNaverRealtime(body: unknown): RealtimeQuote[] {
  if (typeof body !== "object" || body === null) return [];
  const datas = (body as { datas?: unknown }).datas;
  if (!Array.isArray(datas)) return [];

  const quotes: RealtimeQuote[] = [];
  for (const item of datas) {
    if (typeof item !== "object" || item === null) continue;
    const quote = parseItem(item as NaverRealtimeItem);
    if (quote) quotes.push(quote);
  }
  return quotes;
}

/** 종목 코드 목록의 현재가. 일부 묶음이 실패하면 나머지 결과만 돌려준다. */
export async function fetchNaverRealtimeQuotes(
  tickers: readonly string[],
  { timeoutMs }: { timeoutMs: number }
): Promise<RealtimeQuote[]> {
  const groups = chunk([...new Set(tickers)], MAX_CODES_PER_REQUEST);
  const results = await Promise.allSettled(
    groups.map(async (codes) => {
      const res = await fetch(`${ENDPOINT}/${codes.join(",")}`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`naver realtime ${res.status}`);
      return parseNaverRealtime(await res.json());
    })
  );

  const quotes: RealtimeQuote[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      quotes.push(...result.value);
    } else {
      console.warn("[stock-quotes] naver realtime fetch failed", String(result.reason));
    }
  }
  return quotes;
}
