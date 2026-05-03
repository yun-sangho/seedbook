import { db, schema } from "@seedbook/database";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { resolveUserId } from "@web/lib/auth-server";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

export async function GET(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const market = searchParams.get("market")?.trim() || undefined;

  const parsedLimit = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  if (q.length === 0) {
    return Response.json({ results: [] });
  }

  const pattern = `%${q}%`;
  const conditions = [
    eq(schema.stock.isActive, true),
    or(ilike(schema.stock.name, pattern), ilike(schema.stock.ticker, pattern)),
  ];
  if (market) conditions.push(eq(schema.stock.market, market));

  const results = await db
    .select({
      market: schema.stock.market,
      ticker: schema.stock.ticker,
      name: schema.stock.name,
      currency: schema.stock.currency,
    })
    .from(schema.stock)
    .where(and(...conditions))
    .orderBy(asc(schema.stock.name))
    .limit(limit);

  return Response.json({ results });
}
