import { schema } from "@seedbook/database";
import {
  parseRebalancingFields,
  rebalancingPayloadToColumns,
  rebalancingRowToPayload,
} from "@web/server/rebalancing/rebalancing-record";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { assertNoForeignRows } from "./ownership";
import type { DomainTranslator, Envelope } from "./types";

const DOMAIN = "rebalancings";
// 클라이언트 rebalancing-store 의 persist version 과 같다.
const VERSION = 1;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const rebalancingTranslator: DomainTranslator = {
  async read(db, userId) {
    const [rows, listOrder] = await Promise.all([
      db.query.rebalancing.findMany({
        where: (t, { and, eq, isNull }) => and(eq(t.userId, userId), isNull(t.deletedAt)),
      }),
      db.query.userListOrder.findFirst({
        where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.domain, DOMAIN)),
      }),
    ]);

    if (rows.length === 0 && !listOrder) return null;

    const orderIndex = new Map<string, number>();
    (listOrder?.order ?? []).forEach((id, idx) => orderIndex.set(id, idx));
    const sorted = rows.slice().sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    const envelope: Envelope = {
      state: { sessions: sorted.map(rebalancingRowToPayload) },
      version: VERSION,
    };
    return envelope;
  },

  /**
   * envelope 는 "현재 목록 전체" 다. 목록에서 빠진 리밸런싱은 톰스톤(`deletedAt`)으로 남겨
   * 엔티티 동기화 pull 이 삭제를 다른 기기에 전할 수 있게 한다. 모양이 틀린 항목은 버린다.
   */
  async write(db, userId, envelope) {
    const state = envelope.state ?? {};
    const raw = Array.isArray(state.sessions) ? (state.sessions as unknown[]) : [];
    const sessions = raw.flatMap((item) => {
      const id = (item as { id?: unknown } | null)?.id;
      const fields = parseRebalancingFields(item);
      return typeof id === "string" && UUID_RE.test(id) && fields ? [{ id, fields }] : [];
    });

    await db.transaction(async (tx) => {
      // 다른 사용자의 id 를 재사용한 envelope 는 아무것도 쓰기 전에 거부한다.
      await assertNoForeignRows(
        tx,
        schema.rebalancing,
        sessions.map((s) => s.id),
        userId
      );

      const now = new Date();
      const order = sessions.map((s) => s.id);
      await tx
        .insert(schema.userListOrder)
        .values({ userId, domain: DOMAIN, order, updatedAt: now })
        .onConflictDoUpdate({
          target: [schema.userListOrder.userId, schema.userListOrder.domain],
          set: { order, updatedAt: now },
        });

      await tx
        .update(schema.rebalancing)
        .set({ deletedAt: now, updatedAt: now, version: sql`${schema.rebalancing.version} + 1` })
        .where(
          and(
            eq(schema.rebalancing.userId, userId),
            isNull(schema.rebalancing.deletedAt),
            order.length > 0 ? notInArray(schema.rebalancing.id, order) : undefined
          )
        );

      for (const { id, fields } of sessions) {
        const columns = rebalancingPayloadToColumns(fields);
        await tx
          .insert(schema.rebalancing)
          .values({ id, userId, ...columns, updatedAt: now })
          .onConflictDoUpdate({
            target: schema.rebalancing.id,
            // 방어적: 남의 행이면 갱신하지 않는다 (assertNoForeignRows 가 먼저 막음).
            where: eq(schema.rebalancing.userId, userId),
            set: {
              ...columns,
              deletedAt: null,
              updatedAt: now,
              version: sql`${schema.rebalancing.version} + 1`,
            },
          });
      }
    });
  },
};
