import { schema, type Database } from "@seedbook/database";
import { normalizeHoldingsSortOption } from "@web/features/investments/types/holdings-sort";
import {
  investmentRowToFields,
  parseInvestmentFields,
} from "@web/server/investments/investment-record";
import { investmentRepo } from "@web/server/investments/investment-sync";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { assertNoForeignRows } from "./ownership";
import type { DomainTranslator, Envelope } from "./types";

/**
 * `investment-storage` 번역기. cloud 모드의 일상 저장은 엔티티 동기화(`/api/sync`)가 맡고,
 * 이 envelope 경로는 저장소 모드 전환(업로드/다운로드)에서 쓴다. 계좌 저장 규칙은 동기화와
 * 같은 저장소(`investmentRepo`)를 쓴다. 보유 주식 정렬 설정(`holdingsSortOption`)은 계좌
 * 목록이 아니라 사용자 설정이라 여기서만 다룬다.
 */

const DOMAIN = "investment-accounts";
const VERSION = 4;

export const investmentTranslator: DomainTranslator = {
  async read(db, userId) {
    const [accounts, preference, listOrder] = await Promise.all([
      db.query.investmentAccount.findMany({
        where: (t, { and, eq, isNull }) => and(eq(t.userId, userId), isNull(t.deletedAt)),
        with: { records: true, holdings: true, cashItems: true },
      }),
      db.query.userPreference.findFirst({
        where: (t, { eq }) => eq(t.userId, userId),
      }),
      db.query.userListOrder.findFirst({
        where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.domain, DOMAIN)),
      }),
    ]);

    if (accounts.length === 0 && !preference && !listOrder) {
      return null;
    }

    const orderIndex = new Map<string, number>();
    (listOrder?.order ?? []).forEach((id, idx) => orderIndex.set(id, idx));
    const sorted = accounts.slice().sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    const investments = sorted.map((acc) => ({
      id: acc.id,
      ...investmentRowToFields(acc, acc.records, acc.holdings, acc.cashItems),
    }));

    const envelope: Envelope = {
      state: {
        investments,
        holdingsSortOption: normalizeHoldingsSortOption(preference?.holdingsSortOption),
      },
      version: VERSION,
    };
    return envelope;
  },

  /**
   * envelope 는 "현재 목록 전체" 다. 목록에 없는 계좌는 톰스톤으로 남겨 엔티티 동기화
   * pull 이 삭제를 다른 기기에 전할 수 있게 한다.
   */
  async write(db, userId, envelope) {
    const state = envelope.state ?? {};
    const investments = Array.isArray(state.investments)
      ? (state.investments as Array<{ id: string } & Record<string, unknown>>)
      : [];

    await db.transaction(async (tx) => {
      // 다른 사용자의 id 를 재사용한 envelope 는 아무것도 쓰기 전에 거부한다.
      await assertNoForeignRows(
        tx,
        schema.investmentAccount,
        investments.map((inv) => inv.id),
        userId
      );

      const holdingsSortOption = normalizeHoldingsSortOption(state.holdingsSortOption);
      await tx
        .insert(schema.userPreference)
        .values({ userId, holdingsSortOption })
        .onConflictDoUpdate({
          target: schema.userPreference.userId,
          set: { holdingsSortOption },
        });

      const now = new Date();
      const order = investments.map((inv) => inv.id);
      await tx
        .insert(schema.userListOrder)
        .values({ userId, domain: DOMAIN, order, updatedAt: now })
        .onConflictDoUpdate({
          target: [schema.userListOrder.userId, schema.userListOrder.domain],
          set: { order, updatedAt: now },
        });

      // 목록에서 빠진 계좌 → 톰스톤. 이미 삭제된 행은 건드리지 않는다.
      await tx
        .update(schema.investmentAccount)
        .set({
          deletedAt: now,
          updatedAt: now,
          version: sql`${schema.investmentAccount.version} + 1`,
        })
        .where(
          and(
            eq(schema.investmentAccount.userId, userId),
            isNull(schema.investmentAccount.deletedAt),
            order.length > 0 ? notInArray(schema.investmentAccount.id, order) : undefined
          )
        );

      for (const inv of investments) {
        const fields = parseInvestmentFields(inv);
        if (!fields) continue; // 깨진 항목은 건너뛴다 (톰스톤으로 만들지도 않는다).
        await investmentRepo.upsert(tx as unknown as Database, userId, inv.id, fields);
      }
    });
  },
};
