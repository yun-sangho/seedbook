import type { DomainTranslator, Envelope } from "./types";

/**
 * `portfolio-storage` 번역기.
 *
 * Envelope 구조:
 * ```
 * {
 *   state: {
 *     portfolios: PortfolioItem[],   // id, name, description, color, allocations[],
 *                                    //   accountIds[], driftThresholdPercent, note,
 *                                    //   createdAt, updatedAt
 *   },
 *   version: 2,
 * }
 * ```
 *
 * DB rows:
 * - Portfolio            (1 row / 포트폴리오, accountIds: uuid[] / driftThresholdPercent: float)
 * - PortfolioAllocation  (1 row / 종목 비중)
 * - UserListOrder.domain = "portfolios"  (사용자 정렬 순서)
 */

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
  async read(prisma, userId) {
    const [portfolios, listOrder] = await Promise.all([
      prisma.portfolio.findMany({
        where: { userId },
        include: { allocations: true },
      }),
      prisma.userListOrder.findUnique({
        where: { userId_domain: { userId, domain: DOMAIN } },
      }),
    ]);

    if (portfolios.length === 0 && !listOrder) {
      return null;
    }

    // 사용자가 저장한 순서대로 정렬. 새로 추가되어 order 에 없는 항목은 끝에 붙인다.
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

  async write(prisma, userId, envelope) {
    const state = envelope.state ?? {};
    const portfolios = Array.isArray(state.portfolios)
      ? (state.portfolios as PortfolioItemPayload[])
      : [];

    await prisma.$transaction(async (tx) => {
      // 1) 정렬 순서 저장
      const order = portfolios.map((p) => p.id);
      await tx.userListOrder.upsert({
        where: { userId_domain: { userId, domain: DOMAIN } },
        create: { userId, domain: DOMAIN, order },
        update: { order },
      });

      // 2) Stale 포트폴리오 삭제 (cascade 로 allocations 도 함께 제거됨)
      const incomingIds = new Set(portfolios.map((p) => p.id));
      const existingIds = (
        await tx.portfolio.findMany({ where: { userId }, select: { id: true } })
      ).map((r) => r.id);
      const toDelete = existingIds.filter((id) => !incomingIds.has(id));
      if (toDelete.length > 0) {
        await tx.portfolio.deleteMany({ where: { id: { in: toDelete } } });
      }

      // 3) 각 포트폴리오 upsert + allocations 전체 교체
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
        await tx.portfolio.upsert({
          where: { id: p.id },
          create: {
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
          },
          update: {
            name: p.name,
            description: p.description ?? "",
            color: p.color,
            note: p.note ?? "",
            accountIds,
            driftThresholdPercent,
            updatedAt,
          },
        });

        // Allocations 는 한 포트폴리오당 수십 건 이하로 가정 — 전체 교체.
        await tx.portfolioAllocation.deleteMany({ where: { portfolioId: p.id } });
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
          await tx.portfolioAllocation.createMany({ data: rows, skipDuplicates: true });
        }
      }
    });
  },
};
