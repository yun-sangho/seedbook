import { db, kstDateString, schema } from "@seedbook/database";
import { and, desc, eq } from "drizzle-orm";
import { resolveUserId } from "@web/lib/auth-server";

interface PriceQueryItem {
  market: string;
  ticker: string;
}

interface PriceResultItem {
  market: string;
  ticker: string;
  date: string;
  close: number;
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

  const items = Array.isArray(body.items)
    ? (body.items as unknown[]).filter(
        (it): it is PriceQueryItem =>
          typeof it === "object" &&
          it !== null &&
          typeof (it as PriceQueryItem).market === "string" &&
          typeof (it as PriceQueryItem).ticker === "string" &&
          (it as PriceQueryItem).market.length > 0 &&
          (it as PriceQueryItem).ticker.length > 0,
      )
    : [];

  if (items.length === 0) {
    return Response.json({ prices: [] });
  }

  const prices: PriceResultItem[] = [];

  await Promise.all(
    items.map(async ({ market, ticker }) => {
      const rows = await db
        .select({ date: schema.stockPrice.date, close: schema.stockPrice.close })
        .from(schema.stockPrice)
        .where(
          and(
            eq(schema.stockPrice.stockMarket, market),
            eq(schema.stockPrice.stockTicker, ticker),
          ),
        )
        .orderBy(desc(schema.stockPrice.date))
        .limit(1);

      const row = rows[0];
      if (!row) return;

      prices.push({
        market,
        ticker,
        date: kstDateString(row.date),
        close: Number(row.close),
      });
    }),
  );

  return Response.json({ prices });
}
