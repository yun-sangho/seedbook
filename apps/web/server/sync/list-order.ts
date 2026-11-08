import { schema, type Database } from "@seedbook/database";
import { and, eq, gt } from "drizzle-orm";
import type { ListOrderChange, MutationResult } from "./types";

/**
 * 목록 순서를 저장하는 도메인. envelope translator 들이 `user_list_order.domain` 에
 * 쓰는 값과 같다. 순서는 엔티티와 따로 last-write-wins 로 동기화한다.
 */
export const LIST_ORDER_DOMAINS = [
  "investment-accounts",
  "savings-accounts",
  "debts",
  "real-assets",
  "asset-plans",
  "portfolios",
] as const;

export function isListOrderDomain(value: unknown): value is (typeof LIST_ORDER_DOMAINS)[number] {
  return (LIST_ORDER_DOMAINS as readonly unknown[]).includes(value);
}

export async function setListOrder(
  db: Database,
  userId: string,
  domain: string,
  order: string[]
): Promise<MutationResult> {
  const now = new Date();
  await db
    .insert(schema.userListOrder)
    .values({ userId, domain, order, updatedAt: now })
    .onConflictDoUpdate({
      target: [schema.userListOrder.userId, schema.userListOrder.domain],
      set: { order, updatedAt: now },
    });
  return { status: "ok" };
}

export async function listOrderChanges(
  db: Database,
  userId: string,
  since: Date | null
): Promise<{ rows: ListOrderChange[]; latest: Date | null }> {
  const rows = await db
    .select()
    .from(schema.userListOrder)
    .where(
      and(
        eq(schema.userListOrder.userId, userId),
        since ? gt(schema.userListOrder.updatedAt, since) : undefined
      )
    );
  const latest = rows.reduce<Date | null>(
    (max, r) => (max === null || r.updatedAt > max ? r.updatedAt : max),
    null
  );
  return { rows: rows.map((r) => ({ domain: r.domain, order: r.order })), latest };
}
