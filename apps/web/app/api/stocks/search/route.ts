import { prisma } from "@seedbook/database";
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

  const results = await prisma.stock.findMany({
    where: {
      isActive: true,
      ...(market ? { market } : {}),
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { ticker: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      market: true,
      ticker: true,
      name: true,
      currency: true,
    },
    take: limit,
    orderBy: [{ name: "asc" }],
  });

  return Response.json({ results });
}
