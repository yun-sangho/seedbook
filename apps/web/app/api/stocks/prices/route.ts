import { db, kstDateString, schema } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";
import { loadQuotes, stockRefKey, type StockRef } from "@web/lib/stock-quotes/load-quotes";
import {
  pickPricePoint,
  type DailyClose,
  type PricePoint,
} from "@web/lib/stock-quotes/quote-policy";
import { and, desc, eq } from "drizzle-orm";

/** 한 요청에서 받는 종목 수 상한. 외부 소스 호출량을 제한한다. */
const MAX_ITEMS = 200;

type PriceResultItem = StockRef & PricePoint;

function isStockRef(it: unknown): it is StockRef {
  return (
    typeof it === "object" &&
    it !== null &&
    typeof (it as StockRef).market === "string" &&
    typeof (it as StockRef).ticker === "string" &&
    (it as StockRef).market.length > 0 &&
    (it as StockRef).ticker.length > 0
  );
}

async function loadDailyClose({ market, ticker }: StockRef): Promise<DailyClose | null> {
  const rows = await db
    .select({ date: schema.stockPrice.date, close: schema.stockPrice.close })
    .from(schema.stockPrice)
    .where(
      and(eq(schema.stockPrice.stockMarket, market), eq(schema.stockPrice.stockTicker, ticker))
    )
    .orderBy(desc(schema.stockPrice.date))
    .limit(1);

  const row = rows[0];
  return row ? { date: kstDateString(row.date), close: Number(row.close) } : null;
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { items?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const unique = new Map<string, StockRef>();
  for (const it of Array.isArray(body.items) ? body.items : []) {
    if (isStockRef(it)) unique.set(stockRefKey(it.market, it.ticker), it);
  }
  const items = [...unique.values()].slice(0, MAX_ITEMS);

  if (items.length === 0) {
    return Response.json({ prices: [] });
  }

  const [dailyCloses, quotes] = await Promise.all([
    Promise.all(items.map(loadDailyClose)),
    loadQuotes(items, new Date()),
  ]);

  const prices: PriceResultItem[] = [];
  items.forEach((ref, index) => {
    const point = pickPricePoint(
      dailyCloses[index] ?? null,
      quotes.get(stockRefKey(ref.market, ref.ticker)) ?? null
    );
    if (point) prices.push({ market: ref.market, ticker: ref.ticker, ...point });
  });

  return Response.json({ prices });
}
