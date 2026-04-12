import {
  bigIntToNumber,
  type DomainTranslator,
  formatDate,
  parseDate,
  toBigInt,
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
  accountOwner: string;
  currency: string;
  balance: number;
  interestRate?: number;
  note?: string;
  color: string;
  records?: Array<{ date: string; balance: number }>;
};

export const savingsTranslator: DomainTranslator = {
  async read(prisma, userId) {
    const [accounts, listOrder] = await Promise.all([
      prisma.savingsAccount.findMany({
        where: { userId },
        include: { records: { orderBy: { date: "desc" } } },
      }),
      prisma.userListOrder.findUnique({
        where: { userId_domain: { userId, domain: DOMAIN } },
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
      accountOwner: acc.accountOwner,
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

  async write(prisma, userId, envelope) {
    const state = envelope.state ?? {};
    const savings = Array.isArray(state.savings)
      ? (state.savings as SavingsItemPayload[])
      : [];

    await prisma.$transaction(async (tx) => {
      const order = savings.map((s) => s.id);
      await tx.userListOrder.upsert({
        where: { userId_domain: { userId, domain: DOMAIN } },
        create: { userId, domain: DOMAIN, order },
        update: { order },
      });

      const incomingIds = new Set(savings.map((s) => s.id));
      const existingIds = (
        await tx.savingsAccount.findMany({ where: { userId }, select: { id: true } })
      ).map((r) => r.id);
      const toDelete = existingIds.filter((id) => !incomingIds.has(id));
      if (toDelete.length > 0) {
        await tx.savingsAccount.deleteMany({ where: { id: { in: toDelete } } });
      }

      for (const s of savings) {
        await tx.savingsAccount.upsert({
          where: { id: s.id },
          create: {
            id: s.id,
            userId,
            accountName: s.accountName,
            accountType: s.accountType,
            accountOwner: s.accountOwner,
            currency: s.currency,
            balance: toBigInt(s.balance),
            interestRate: s.interestRate ?? null,
            note: s.note ?? "",
            color: s.color,
          },
          update: {
            accountName: s.accountName,
            accountType: s.accountType,
            accountOwner: s.accountOwner,
            currency: s.currency,
            balance: toBigInt(s.balance),
            interestRate: s.interestRate ?? null,
            note: s.note ?? "",
            color: s.color,
          },
        });

        await tx.savingsRecord.deleteMany({ where: { accountId: s.id } });
        const recordRows = (s.records ?? [])
          .map((r) => {
            const date = parseDate(r.date);
            if (!date) return null;
            return { accountId: s.id, date, balance: toBigInt(r.balance) };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (recordRows.length > 0) {
          await tx.savingsRecord.createMany({ data: recordRows, skipDuplicates: true });
        }
      }
    });
  },
};
