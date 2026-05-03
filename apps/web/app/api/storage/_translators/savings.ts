import { schema } from "@seedbook/database";
import { and, eq, notInArray } from "drizzle-orm";
import {
  bigIntToNumber,
  formatDate,
  parseDate,
  toBigInt,
  type DomainTranslator,
} from "./types";

/**
 * `savings-storage` 번역기.
 * 구조는 investment 와 거의 동일하지만 nested entity 가 `records` 하나뿐이라
 * 코드가 훨씬 단순하다.
 */

const DOMAIN = "savings-accounts";
const VERSION = 2;

type SavingsItemPayload = {
  id: string;
  accountName: string;
  accountType: string;
  currency: string;
  balance: number;
  interestRate?: number;
  note?: string;
  color: string;
  records?: Array<{ date: string; balance: number }>;
};

export const savingsTranslator: DomainTranslator = {
  async read(db, userId) {
    const [accounts, listOrder] = await Promise.all([
      db.query.savingsAccount.findMany({
        where: (t, { eq }) => eq(t.userId, userId),
        with: { records: { orderBy: (t, { desc }) => [desc(t.date)] } },
      }),
      db.query.userListOrder.findFirst({
        where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.domain, DOMAIN)),
      }),
    ]);

    if (accounts.length === 0 && !listOrder) {
      return null;
    }

    const orderIndex = new Map<string, number>();
    (listOrder?.order ?? []).forEach((id, idx) => orderIndex.set(id, idx));
    const sorted = accounts.slice().sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    const savings = sorted.map((acc) => ({
      id: acc.id,
      accountName: acc.accountName,
      accountType: acc.accountType,
      currency: acc.currency,
      balance: bigIntToNumber(acc.balance),
      interestRate: acc.interestRate ?? undefined,
      note: acc.note,
      color: acc.color,
      records: acc.records.map((r) => ({
        date: formatDate(r.date),
        balance: bigIntToNumber(r.balance),
      })),
    }));

    return {
      state: { savings },
      version: VERSION,
    };
  },

  async write(db, userId, envelope) {
    const state = envelope.state ?? {};
    const savings = Array.isArray(state.savings) ? (state.savings as SavingsItemPayload[]) : [];

    await db.transaction(async (tx) => {
      const order = savings.map((s) => s.id);
      await tx
        .insert(schema.userListOrder)
        .values({ userId, domain: DOMAIN, order })
        .onConflictDoUpdate({
          target: [schema.userListOrder.userId, schema.userListOrder.domain],
          set: { order },
        });

      const incomingIds = savings.map((s) => s.id);
      if (incomingIds.length > 0) {
        await tx
          .delete(schema.savingsAccount)
          .where(
            and(
              eq(schema.savingsAccount.userId, userId),
              notInArray(schema.savingsAccount.id, incomingIds),
            ),
          );
      } else {
        await tx.delete(schema.savingsAccount).where(eq(schema.savingsAccount.userId, userId));
      }

      const now = new Date();
      for (const s of savings) {
        await tx
          .insert(schema.savingsAccount)
          .values({
            id: s.id,
            userId,
            accountName: s.accountName,
            accountType: s.accountType,
            currency: s.currency,
            balance: toBigInt(s.balance),
            interestRate: s.interestRate ?? null,
            note: s.note ?? "",
            color: s.color,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: schema.savingsAccount.id,
            set: {
              accountName: s.accountName,
              accountType: s.accountType,
              currency: s.currency,
              balance: toBigInt(s.balance),
              interestRate: s.interestRate ?? null,
              note: s.note ?? "",
              color: s.color,
              updatedAt: now,
            },
          });

        await tx.delete(schema.savingsRecord).where(eq(schema.savingsRecord.accountId, s.id));
        const recordRows = (s.records ?? [])
          .map((r) => {
            const date = parseDate(r.date);
            if (!date) return null;
            return { accountId: s.id, date, balance: toBigInt(r.balance) };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (recordRows.length > 0) {
          await tx.insert(schema.savingsRecord).values(recordRows).onConflictDoNothing();
        }
      }
    });
  },
};
