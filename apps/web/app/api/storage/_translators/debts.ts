import { schema } from "@seedbook/database";
import {
  debtPayloadToColumns,
  debtRowToPayload,
  type DebtPayload,
} from "@web/server/debts/debt-record";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { assertNoForeignRows } from "./ownership";
import type { DomainTranslator, Envelope } from "./types";

const DOMAIN = "debts";
const VERSION = 2;

type EnvelopeDebt = Omit<DebtPayload, "maturityDate" | "note"> & {
  maturityDate?: string;
  note?: string;
};

export const debtsTranslator: DomainTranslator = {
  async read(db, userId) {
    const [debts, listOrder] = await Promise.all([
      db.query.debt.findMany({
        where: (t, { and, eq, isNull }) => and(eq(t.userId, userId), isNull(t.deletedAt)),
      }),
      db.query.userListOrder.findFirst({
        where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.domain, DOMAIN)),
      }),
    ]);

    if (debts.length === 0 && !listOrder) return null;

    const orderIndex = new Map<string, number>();
    (listOrder?.order ?? []).forEach((id, idx) => orderIndex.set(id, idx));
    const sorted = debts.slice().sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    const envelope: Envelope = {
      state: { debts: sorted.map(debtRowToPayload) },
      version: VERSION,
    };
    return envelope;
  },

  /**
   * envelope 는 "현재 목록 전체" 다. 목록에 없는 부채는 지우지 않고 톰스톤(`deletedAt`)으로
   * 남겨 엔티티 동기화 pull 이 삭제를 다른 기기에 전할 수 있게 한다. 쓰는 행마다 `version`
   * 을 올린다 (envelope 는 무엇이 바뀌었는지 모르므로 전부 바뀐 것으로 본다).
   */
  async write(db, userId, envelope) {
    const state = envelope.state ?? {};
    const debts = Array.isArray(state.debts) ? (state.debts as EnvelopeDebt[]) : [];

    await db.transaction(async (tx) => {
      // 다른 사용자의 id 를 재사용한 envelope 는 아무것도 쓰기 전에 거부한다.
      await assertNoForeignRows(
        tx,
        schema.debt,
        debts.map((d) => d.id),
        userId
      );

      const now = new Date();
      const order = debts.map((d) => d.id);
      await tx
        .insert(schema.userListOrder)
        .values({ userId, domain: DOMAIN, order, updatedAt: now })
        .onConflictDoUpdate({
          target: [schema.userListOrder.userId, schema.userListOrder.domain],
          set: { order, updatedAt: now },
        });

      // 목록에서 빠진 부채 → 톰스톤. 이미 삭제된 행은 건드리지 않는다.
      await tx
        .update(schema.debt)
        .set({ deletedAt: now, updatedAt: now, version: sql`${schema.debt.version} + 1` })
        .where(
          and(
            eq(schema.debt.userId, userId),
            isNull(schema.debt.deletedAt),
            order.length > 0 ? notInArray(schema.debt.id, order) : undefined
          )
        );

      for (const d of debts) {
        const columns = debtPayloadToColumns({
          ...d,
          maturityDate: d.maturityDate ?? "",
          note: d.note ?? "",
        });
        await tx
          .insert(schema.debt)
          .values({ id: d.id, userId, ...columns, updatedAt: now })
          .onConflictDoUpdate({
            target: schema.debt.id,
            // 방어적: 남의 행이면 갱신하지 않는다 (assertNoForeignRows 가 먼저 막음).
            where: eq(schema.debt.userId, userId),
            set: {
              ...columns,
              deletedAt: null,
              updatedAt: now,
              version: sql`${schema.debt.version} + 1`,
            },
          });
      }
    });
  },
};
