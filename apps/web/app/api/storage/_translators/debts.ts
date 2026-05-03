import { schema } from "@seedbook/database";
import { and, eq, notInArray } from "drizzle-orm";
import {
  bigIntToNumber,
  formatDate,
  parseDate,
  toBigInt,
  type DomainTranslator,
  type Envelope,
} from "./types";

const DOMAIN = "debts";
const VERSION = 2;

type DebtPayload = {
  id: string;
  loanName: string;
  loanType: string;
  lender: string;
  amount: number;
  interestRate: number;
  maturityDate?: string;
  monthlyPayment: number;
  note?: string;
};

export const debtsTranslator: DomainTranslator = {
  async read(db, userId) {
    const [debts, listOrder] = await Promise.all([
      db.query.debt.findMany({ where: (t, { eq }) => eq(t.userId, userId) }),
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

    const payload = sorted.map((d) => ({
      id: d.id,
      loanName: d.loanName,
      loanType: d.loanType,
      lender: d.lender,
      amount: bigIntToNumber(d.amount),
      interestRate: d.interestRate,
      maturityDate: d.maturityDate ? formatDate(d.maturityDate) : "",
      monthlyPayment: bigIntToNumber(d.monthlyPayment),
      note: d.note,
    }));

    const envelope: Envelope = {
      state: { debts: payload },
      version: VERSION,
    };
    return envelope;
  },

  async write(db, userId, envelope) {
    const state = envelope.state ?? {};
    const debts = Array.isArray(state.debts) ? (state.debts as DebtPayload[]) : [];

    await db.transaction(async (tx) => {
      const order = debts.map((d) => d.id);
      await tx
        .insert(schema.userListOrder)
        .values({ userId, domain: DOMAIN, order })
        .onConflictDoUpdate({
          target: [schema.userListOrder.userId, schema.userListOrder.domain],
          set: { order },
        });

      const incomingIds = debts.map((d) => d.id);
      if (incomingIds.length > 0) {
        await tx
          .delete(schema.debt)
          .where(and(eq(schema.debt.userId, userId), notInArray(schema.debt.id, incomingIds)));
      } else {
        await tx.delete(schema.debt).where(eq(schema.debt.userId, userId));
      }

      const now = new Date();
      for (const d of debts) {
        const maturityDate = d.maturityDate ? parseDate(d.maturityDate) : null;
        await tx
          .insert(schema.debt)
          .values({
            id: d.id,
            userId,
            loanName: d.loanName,
            loanType: d.loanType,
            lender: d.lender,
            amount: toBigInt(d.amount),
            interestRate: d.interestRate,
            maturityDate,
            monthlyPayment: toBigInt(d.monthlyPayment),
            note: d.note ?? "",
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: schema.debt.id,
            set: {
              loanName: d.loanName,
              loanType: d.loanType,
              lender: d.lender,
              amount: toBigInt(d.amount),
              interestRate: d.interestRate,
              maturityDate,
              monthlyPayment: toBigInt(d.monthlyPayment),
              note: d.note ?? "",
              updatedAt: now,
            },
          });
      }
    });
  },
};
