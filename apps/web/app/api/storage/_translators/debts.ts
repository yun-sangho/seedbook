import {
  bigIntToNumber,
  type DomainTranslator,
  type Envelope,
  formatDate,
  parseDate,
  toBigInt,
} from "./types";

const DOMAIN = "debts";
const VERSION = 2;

type DebtPayload = {
  id: string;
  loanName: string;
  loanType: string;
  loanOwner: string;
  lender: string;
  amount: number;
  interestRate: number;
  maturityDate?: string;
  monthlyPayment: number;
  note?: string;
};

export const debtsTranslator: DomainTranslator = {
  async read(prisma, userId) {
    const [debts, listOrder] = await Promise.all([
      prisma.debt.findMany({ where: { userId } }),
      prisma.userListOrder.findUnique({
        where: { userId_domain: { userId, domain: DOMAIN } },
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
      loanOwner: d.loanOwner,
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

  async write(prisma, userId, envelope) {
    const state = envelope.state ?? {};
    const debts = Array.isArray(state.debts) ? (state.debts as DebtPayload[]) : [];

    await prisma.$transaction(async (tx) => {
      const order = debts.map((d) => d.id);
      await tx.userListOrder.upsert({
        where: { userId_domain: { userId, domain: DOMAIN } },
        create: { userId, domain: DOMAIN, order },
        update: { order },
      });

      const incomingIds = new Set(debts.map((d) => d.id));
      const existingIds = (
        await tx.debt.findMany({ where: { userId }, select: { id: true } })
      ).map((r) => r.id);
      const toDelete = existingIds.filter((id) => !incomingIds.has(id));
      if (toDelete.length > 0) {
        await tx.debt.deleteMany({ where: { id: { in: toDelete } } });
      }

      for (const d of debts) {
        const maturityDate = d.maturityDate ? parseDate(d.maturityDate) : null;
        await tx.debt.upsert({
          where: { id: d.id },
          create: {
            id: d.id,
            userId,
            loanName: d.loanName,
            loanType: d.loanType,
            loanOwner: d.loanOwner,
            lender: d.lender,
            amount: toBigInt(d.amount),
            interestRate: d.interestRate,
            maturityDate,
            monthlyPayment: toBigInt(d.monthlyPayment),
            note: d.note ?? "",
          },
          update: {
            loanName: d.loanName,
            loanType: d.loanType,
            loanOwner: d.loanOwner,
            lender: d.lender,
            amount: toBigInt(d.amount),
            interestRate: d.interestRate,
            maturityDate,
            monthlyPayment: toBigInt(d.monthlyPayment),
            note: d.note ?? "",
          },
        });
      }
    });
  },
};
