import { schema, type Database } from "@seedbook/database";
import { dedupePortfolioLinks } from "@web/features/portfolio/utils/portfolio-links";
import { parsePortfolioFields, portfolioRowToData } from "@web/server/portfolio/portfolio-record";
import { portfolioRepo } from "@web/server/portfolio/portfolio-sync";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { assertNoForeignRows } from "./ownership";
import type { DomainTranslator, Envelope } from "./types";

/**
 * `portfolio-storage` 번역기. cloud 모드의 일상 저장은 엔티티 동기화(`/api/sync`)가 맡고,
 * 이 envelope 경로는 저장소 모드 전환(업로드/다운로드)에서 쓴다. 포트폴리오 저장 규칙은
 * 동기화와 같은 저장소(`portfolioRepo`)를 쓴다.
 */

const DOMAIN = "portfolios";
// v3: 한 계좌는 하나의 포트폴리오에만 연결 (클라이언트 portfolio-store 와 동일 버전).
const VERSION = 3;

type EnvelopePortfolio = { id: string; accountIds: string[]; updatedAt?: string } & Record<
  string,
  unknown
>;

export const portfolioTranslator: DomainTranslator = {
  async read(db, userId) {
    const [portfolios, listOrder] = await Promise.all([
      db.query.portfolio.findMany({
        where: (t, { and, eq, isNull }) => and(eq(t.userId, userId), isNull(t.deletedAt)),
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

    const envelope: Envelope = {
      // 규칙(한 계좌 = 한 포트폴리오) 이전에 저장된 중복 연결이 남아 있을 수 있어 정리한다.
      state: {
        portfolios: dedupePortfolioLinks(
          sorted.map((p) => ({ id: p.id, ...portfolioRowToData(p, p.allocations) }))
        ),
      },
      version: VERSION,
    };
    return envelope;
  },

  /**
   * envelope 는 "현재 목록 전체" 다. 목록에 없는 포트폴리오는 톰스톤으로 남겨 엔티티
   * 동기화 pull 이 삭제를 다른 기기에 전할 수 있게 한다.
   */
  async write(db, userId, envelope) {
    const state = envelope.state ?? {};
    // v3 이전 클라이언트가 중복 연결을 보낼 수 있어 저장 전에도 정리한다.
    const portfolios = dedupePortfolioLinks(
      (Array.isArray(state.portfolios) ? (state.portfolios as EnvelopePortfolio[]) : []).map(
        (p) => ({
          ...p,
          accountIds: Array.isArray(p.accountIds)
            ? p.accountIds.filter((id) => typeof id === "string")
            : [],
        })
      )
    );

    await db.transaction(async (tx) => {
      // 다른 사용자의 id 를 재사용한 envelope 는 아무것도 쓰기 전에 거부한다.
      await assertNoForeignRows(
        tx,
        schema.portfolio,
        portfolios.map((p) => p.id),
        userId
      );

      const now = new Date();
      const order = portfolios.map((p) => p.id);
      await tx
        .insert(schema.userListOrder)
        .values({ userId, domain: DOMAIN, order, updatedAt: now })
        .onConflictDoUpdate({
          target: [schema.userListOrder.userId, schema.userListOrder.domain],
          set: { order, updatedAt: now },
        });

      // 목록에서 빠진 포트폴리오 → 톰스톤. 이미 삭제된 행은 건드리지 않는다.
      await tx
        .update(schema.portfolio)
        .set({ deletedAt: now, updatedAt: now, version: sql`${schema.portfolio.version} + 1` })
        .where(
          and(
            eq(schema.portfolio.userId, userId),
            isNull(schema.portfolio.deletedAt),
            order.length > 0 ? notInArray(schema.portfolio.id, order) : undefined
          )
        );

      for (const p of portfolios) {
        const fields = parsePortfolioFields(p);
        if (!fields) continue; // 깨진 항목은 건너뛴다 (톰스톤으로 만들지도 않는다).
        await portfolioRepo.upsert(tx as unknown as Database, userId, p.id, fields);
      }
    });
  },
};
