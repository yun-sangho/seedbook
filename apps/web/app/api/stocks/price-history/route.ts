import { db } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";
import { isDateString } from "@web/server/account-snapshots/account-snapshot-record";
import {
  loadDailyCloses,
  MAX_PRICE_HISTORY_DAYS,
  MAX_PRICE_HISTORY_ITEMS,
  type StockSymbol,
} from "@web/server/stocks/price-history";

/**
 * 여러 종목의 일별 종가 이력 (local 모드 계좌 총액 기록을 앱에서 채울 때).
 *
 * `POST { items: [{ market, ticker }], from, to }` (KST YYYY-MM-DD, 양끝 포함) →
 * `{ prices: [{ market, ticker, closes: [{ date, close }] }] }`. 각 종목의 `closes` 는 범위 안
 * 종가와 범위 전의 마지막 종가 하나를 날짜 오름차순으로 담는다. 종가가 없는 종목은 빠진다.
 */

function isSymbol(it: unknown): it is StockSymbol {
  const s = it as StockSymbol | null;
  return (
    typeof s === "object" &&
    s !== null &&
    typeof s.market === "string" &&
    typeof s.ticker === "string" &&
    s.market.length > 0 &&
    s.ticker.length > 0
  );
}

function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { items?: unknown; from?: unknown; to?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { from, to } = body;
  if (!isDateString(from) || !isDateString(to) || from > to)
    return badRequest("Invalid date range");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_PRICE_HISTORY_DAYS) return badRequest("Date range too long");

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > MAX_PRICE_HISTORY_ITEMS) return badRequest("Too many items");
  const unique = new Map<string, StockSymbol>();
  for (const it of items) if (isSymbol(it)) unique.set(`${it.market}:${it.ticker}`, it);

  const closes = await loadDailyCloses(db, [...unique.values()], from, to);
  const prices = [...unique.values()].flatMap((s) => {
    const series = closes.get(`${s.market}:${s.ticker}`);
    return series ? [{ market: s.market, ticker: s.ticker, closes: series }] : [];
  });
  return Response.json({ prices });
}
