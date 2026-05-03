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

const DOMAIN = "investment-accounts";
const VERSION = 4;

type InvestmentItemPayload = {
  id: string;
  accountName: string;
  accountType: string;
  currency: string;
  initialInvestment: number;
  currentValue: number;
  note?: string;
  color: string;
  records?: Array<{
    date: string;
    initialInvestment: number;
    currentValue: number;
  }>;
  holdings?: Array<{
    id: string;
    market: string;
    ticker: string;
    name: string;
    currency: string;
    quantity: number;
    memo?: string;
  }>;
  cashItems?: Array<{
    id: string;
    label: string;
    amount: number;
  }>;
};

export const investmentTranslator: DomainTranslator = {
  async read(db, userId) {
    const [accounts, preference, listOrder] = await Promise.all([
      db.query.investmentAccount.findMany({
        where: (t, { eq }) => eq(t.userId, userId),
        with: {
          records: { orderBy: (t, { desc }) => [desc(t.date)] },
          holdings: true,
          cashItems: true,
        },
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
      accountName: acc.accountName,
      accountType: acc.accountType,
      currency: acc.currency,
      initialInvestment: bigIntToNumber(acc.initialInvestment),
      currentValue: bigIntToNumber(acc.currentValue),
      note: acc.note,
      color: acc.color,
      records: acc.records.map((r) => ({
        date: formatDate(r.date),
        initialInvestment: bigIntToNumber(r.initialInvestment),
        currentValue: bigIntToNumber(r.currentValue),
      })),
      holdings: acc.holdings.map((h) => ({
        id: h.id,
        market: h.market,
        ticker: h.ticker,
        name: h.name,
        currency: h.currency,
        quantity: h.quantity,
        memo: h.memo,
      })),
      cashItems: acc.cashItems.map((c) => ({
        id: c.id,
        label: c.label,
        amount: bigIntToNumber(c.amount),
      })),
    }));

    const envelope: Envelope = {
      state: {
        investments,
        holdingsSortOption: preference?.holdingsSortOption ?? "default",
      },
      version: VERSION,
    };
    return envelope;
  },

  async write(db, userId, envelope) {
    const state = envelope.state ?? {};
    const investments = Array.isArray(state.investments)
      ? (state.investments as InvestmentItemPayload[])
      : [];

    await db.transaction(async (tx) => {
      const holdingsSortOption =
        typeof state.holdingsSortOption === "string" ? state.holdingsSortOption : "default";

      // 1) UserPreference upsert
      await tx
        .insert(schema.userPreference)
        .values({ userId, holdingsSortOption })
        .onConflictDoUpdate({
          target: schema.userPreference.userId,
          set: { holdingsSortOption },
        });

      // 2) UserListOrder upsert (composite key userId+domain)
      const order = investments.map((inv) => inv.id);
      await tx
        .insert(schema.userListOrder)
        .values({ userId, domain: DOMAIN, order })
        .onConflictDoUpdate({
          target: [schema.userListOrder.userId, schema.userListOrder.domain],
          set: { order },
        });

      // 3) Stale 계좌 삭제 (cascade 로 records/holdings/cashItems 도 함께)
      const incomingIds = investments.map((inv) => inv.id);
      if (incomingIds.length > 0) {
        await tx
          .delete(schema.investmentAccount)
          .where(
            and(
              eq(schema.investmentAccount.userId, userId),
              notInArray(schema.investmentAccount.id, incomingIds),
            ),
          );
      } else {
        await tx
          .delete(schema.investmentAccount)
          .where(eq(schema.investmentAccount.userId, userId));
      }

      // 4) 각 계좌 upsert + nested entities
      const now = new Date();
      for (const inv of investments) {
        await tx
          .insert(schema.investmentAccount)
          .values({
            id: inv.id,
            userId,
            accountName: inv.accountName,
            accountType: inv.accountType,
            currency: inv.currency,
            initialInvestment: toBigInt(inv.initialInvestment),
            currentValue: toBigInt(inv.currentValue),
            note: inv.note ?? "",
            color: inv.color,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: schema.investmentAccount.id,
            set: {
              accountName: inv.accountName,
              accountType: inv.accountType,
              currency: inv.currency,
              initialInvestment: toBigInt(inv.initialInvestment),
              currentValue: toBigInt(inv.currentValue),
              note: inv.note ?? "",
              color: inv.color,
              updatedAt: now,
            },
          });

        // Records: 전체 지우고 재삽입
        await tx
          .delete(schema.investmentRecord)
          .where(eq(schema.investmentRecord.accountId, inv.id));
        const recordRows = (inv.records ?? [])
          .map((r) => {
            const date = parseDate(r.date);
            if (!date) return null;
            return {
              accountId: inv.id,
              date,
              initialInvestment: toBigInt(r.initialInvestment),
              currentValue: toBigInt(r.currentValue),
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (recordRows.length > 0) {
          await tx.insert(schema.investmentRecord).values(recordRows).onConflictDoNothing();
        }

        // Holdings: stale 삭제 + upsert
        const incomingHoldingIds = Array.from(new Set((inv.holdings ?? []).map((h) => h.id)));
        if (incomingHoldingIds.length > 0) {
          await tx
            .delete(schema.stockHolding)
            .where(
              and(
                eq(schema.stockHolding.accountId, inv.id),
                notInArray(schema.stockHolding.id, incomingHoldingIds),
              ),
            );
        } else {
          await tx.delete(schema.stockHolding).where(eq(schema.stockHolding.accountId, inv.id));
        }
        for (const h of inv.holdings ?? []) {
          await tx
            .insert(schema.stockHolding)
            .values({
              id: h.id,
              accountId: inv.id,
              market: h.market,
              ticker: h.ticker,
              name: h.name,
              currency: h.currency,
              quantity: h.quantity,
              memo: h.memo ?? "",
            })
            .onConflictDoUpdate({
              target: schema.stockHolding.id,
              set: {
                market: h.market,
                ticker: h.ticker,
                name: h.name,
                currency: h.currency,
                quantity: h.quantity,
                memo: h.memo ?? "",
              },
            });
        }

        // CashItems: stale 삭제 + upsert
        const incomingCashIds = Array.from(new Set((inv.cashItems ?? []).map((c) => c.id)));
        if (incomingCashIds.length > 0) {
          await tx
            .delete(schema.cashItem)
            .where(
              and(
                eq(schema.cashItem.accountId, inv.id),
                notInArray(schema.cashItem.id, incomingCashIds),
              ),
            );
        } else {
          await tx.delete(schema.cashItem).where(eq(schema.cashItem.accountId, inv.id));
        }
        for (const c of inv.cashItems ?? []) {
          await tx
            .insert(schema.cashItem)
            .values({
              id: c.id,
              accountId: inv.id,
              label: c.label,
              amount: toBigInt(c.amount),
            })
            .onConflictDoUpdate({
              target: schema.cashItem.id,
              set: { label: c.label, amount: toBigInt(c.amount) },
            });
        }
      }
    });
  },
};
