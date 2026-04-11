import { kstDateString, prisma } from "@seedbook/database";

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
          (it as PriceQueryItem).ticker.length > 0
      )
    : [];

  if (items.length === 0) {
    return Response.json({ prices: [] });
  }

  const prices: PriceResultItem[] = [];

  await Promise.all(
    items.map(async ({ market, ticker }) => {
      const row = await prisma.stockPrice.findFirst({
        where: { stockMarket: market, stockTicker: ticker },
        orderBy: { date: "desc" },
        select: { date: true, close: true },
      });

      if (!row) return;

      prices.push({
        market,
        ticker,
        // DB 는 canonical KST 자정 instant (UTC) 를 저장한다. 클라이언트에는
        // KST 기준 달력일 "YYYY-MM-DD" 로 변환해서 노출한다.
        date: kstDateString(row.date),
        close: Number(row.close),
      });
    })
  );

  return Response.json({ prices });
}
