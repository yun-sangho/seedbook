import { schema } from "@seedbook/database";
import { and, eq, notInArray } from "drizzle-orm";
import type { DomainTranslator, Envelope } from "./types";

const DOMAIN = "portfolios";
const VERSION = 2;
const DEFAULT_DRIFT_THRESHOLD_PERCENT = 5;

type PortfolioAllocationPayload = {
  id: string;
  market: string;
  ticker: string;
  name: string;
  currency: string;
  targetPercent: number;
};

type PortfolioItemPayload = {
  id: string;
  name: string;
  description?: string;
  color: string;
  allocations?: PortfolioAllocationPayload[];
  accountIds?: string[];
  driftThresholdPercent?: number;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const portfolioTranslator: DomainTranslator = {
  async read(db, userId) {
    const [portfolios, listOrder] = await Promise.all([
      db.query.portfolio.findMany({
        where: (t, { eq }) => eq(t.userId, userId),
        with: { allocations: true },
      }),
      db.query.userListOrder.findFirst({
        where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.domain, DOMAIN)),
      }),
    ]);

    if (portfolios.length === 0 && !listOrder) {
      return null;
    }

    const orderIndex = new Map<string, number>();
    (listOrder?.order ?? []).forEach((id, idx) => orderIndex.set(id, idx));
    const sorted = portfolios.slice().sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    const payload: PortfolioItemPayload[] = sorted.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      color: p.color,
      note: p.note,
      accountIds: p.accountIds,
      driftThresholdPercent: p.driftThresholdPercent,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      allocations: p.allocations.map((a) => ({
        id: a.id,
        market: a.market,
        ticker: a.ticker,
        name: a.name,
        currency: a.currency,
        targetPercent: a.targetPercent,
      })),
    }));

    const envelope: Envelope = {
      state: { portfolios: payload },
      version: VERSION,
    };
    return envelope;
  },

  async write(db, userId, envelope) {
    const state = envelope.state ?? {};
    const portfolios = Array.isArray(state.portfolios)
      ? (state.portfolios as PortfolioItemPayload[])
      : [];

    await db.transaction(async (tx) => {
      const order = portfolios.map((p) => p.id);
      await tx
        .insert(schema.userListOrder)
        .values({ userId, domain: DOMAIN, order })
        .onConflictDoUpdate({
          target: [schema.userListOrder.userId, schema.userListOrder.domain],
          set: { order },
        });

      const incomingIds = portfolios.map((p) => p.id);
      if (incomingIds.length > 0) {
        await tx
          .delete(schema.portfolio)
          .where(
            and(eq(schema.portfolio.userId, userId), notInArray(schema.portfolio.id, incomingIds)),
          );
      } else {
        await tx.delete(schema.portfolio).where(eq(schema.portfolio.userId, userId));
      }

      for (const p of portfolios) {
        const createdAt = p.createdAt ? new Date(p.createdAt) : new Date();
        const updatedAt = p.updatedAt ? new Date(p.updatedAt) : new Date();
        const accountIds = Array.isArray(p.accountIds)
          ? Array.from(new Set(p.accountIds.filter((id) => typeof id === "string")))
          : [];
        const driftThresholdPercent =
          typeof p.driftThresholdPercent === "number" && Number.isFinite(p.driftThresholdPercent)
            ? Math.max(0, p.driftThresholdPercent)
            : DEFAULT_DRIFT_THRESHOLD_PERCENT;
        await tx
          .insert(schema.portfolio)
          .values({
            id: p.id,
            userId,
            name: p.name,
            description: p.description ?? "",
            color: p.color,
            note: p.note ?? "",
            accountIds,
            driftThresholdPercent,
            createdAt,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: schema.portfolio.id,
            set: {
              name: p.name,
              description: p.description ?? "",
              color: p.color,
              note: p.note ?? "",
              accountIds,
              driftThresholdPercent,
              updatedAt,
            },
          });

        await tx
          .delete(schema.portfolioAllocation)
          .where(eq(schema.portfolioAllocation.portfolioId, p.id));
        const rows = (p.allocations ?? []).map((a) => ({
          id: a.id,
          portfolioId: p.id,
          market: a.market,
          ticker: a.ticker,
          name: a.name,
          currency: a.currency,
          targetPercent: a.targetPercent,
        }));
        if (rows.length > 0) {
          await tx.insert(schema.portfolioAllocation).values(rows).onConflictDoNothing();
        }
      }
    });
  },
};
