import {
  bigIntToNumber,
  type DomainTranslator,
  type Envelope,
  formatDate,
  parseDate,
  toBigInt,
} from "./types";

/**
 * `investment-storage` 번역기.
 *
 * Envelope 구조:
 * ```
 * {
 *   state: {
 *     investments: InvestmentItem[],       // id, accountName, records[], holdings[], cashItems[], ...
 *     holdingsSortOption: string,           // UserPreference 에서 읽어옴 (데이터와 분리)
 *   },
 *   version: 4,
 * }
 * ```
 *
 * DB rows:
 * - InvestmentAccount (1 row / 계좌)
 * - InvestmentRecord  (1 row / 계좌 × 날짜)
 * - StockHolding      (1 row / 보유 종목)
 * - CashItem          (1 row / 현금 항목)
 * - UserPreference.holdingsSortOption
 * - UserListOrder.domain = "investment-accounts"
 */

const DOMAIN = "investment-accounts";
const VERSION = 4;

type InvestmentItemPayload = {
  id: string;
  accountName: string;
  accountType: string;
  accountOwner: string;
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
  async read(prisma, userId) {
    const [accounts, preference, listOrder] = await Promise.all([
      prisma.investmentAccount.findMany({
        where: { userId },
        include: {
          records: { orderBy: { date: "desc" } },
          holdings: true,
          cashItems: true,
        },
      }),
      prisma.userPreference.findUnique({ where: { userId } }),
      prisma.userListOrder.findUnique({
        where: { userId_domain: { userId, domain: DOMAIN } },
      }),
    ]);

    if (accounts.length === 0 && !preference && !listOrder) {
      return null;
    }

    // Sort accounts according to the user's saved order. Accounts not in the
    // order array (newly added on another device, etc.) go at the end.
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
      accountOwner: acc.accountOwner,
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

  async write(prisma, userId, envelope) {
    const state = envelope.state ?? {};
    const investments = Array.isArray(state.investments)
      ? (state.investments as InvestmentItemPayload[])
      : [];

    // 트랜잭션: 모든 row 변경을 원자적으로 적용. 한 번이라도 실패하면 전체 롤백.
    await prisma.$transaction(async (tx) => {
      // 1) UserPreference upsert (holdingsSortOption)
      const holdingsSortOption =
        typeof state.holdingsSortOption === "string" ? state.holdingsSortOption : "default";
      await tx.userPreference.upsert({
        where: { userId },
        create: { userId, holdingsSortOption },
        update: { holdingsSortOption },
      });

      // 2) 계좌 순서를 UserListOrder 에 저장
      const order = investments.map((inv) => inv.id);
      await tx.userListOrder.upsert({
        where: { userId_domain: { userId, domain: DOMAIN } },
        create: { userId, domain: DOMAIN, order },
        update: { order },
      });

      // 3) Stale 계좌 삭제 (현재 envelope 에 없는 것들). Cascade 로 records /
      //    holdings / cashItems 도 함께 지워진다.
      const incomingIds = new Set(investments.map((inv) => inv.id));
      const existingIds = (
        await tx.investmentAccount.findMany({ where: { userId }, select: { id: true } })
      ).map((r) => r.id);
      const toDelete = existingIds.filter((id) => !incomingIds.has(id));
      if (toDelete.length > 0) {
        await tx.investmentAccount.deleteMany({ where: { id: { in: toDelete } } });
      }

      // 4) 각 계좌 upsert + nested entities
      for (const inv of investments) {
        await tx.investmentAccount.upsert({
          where: { id: inv.id },
          create: {
            id: inv.id,
            userId,
            accountName: inv.accountName,
            accountType: inv.accountType,
            accountOwner: inv.accountOwner,
            currency: inv.currency,
            initialInvestment: toBigInt(inv.initialInvestment),
            currentValue: toBigInt(inv.currentValue),
            note: inv.note ?? "",
            color: inv.color,
          },
          update: {
            accountName: inv.accountName,
            accountType: inv.accountType,
            accountOwner: inv.accountOwner,
            currency: inv.currency,
            initialInvestment: toBigInt(inv.initialInvestment),
            currentValue: toBigInt(inv.currentValue),
            note: inv.note ?? "",
            color: inv.color,
          },
        });

        // Records 는 (accountId, date) 복합 PK 이므로 전체 지우고 재삽입하는
        // 간단한 전략을 쓴다. 한 계좌당 records 는 수백 건 이하로 가정.
        await tx.investmentRecord.deleteMany({ where: { accountId: inv.id } });
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
          await tx.investmentRecord.createMany({ data: recordRows, skipDuplicates: true });
        }

        // Holdings: stale 삭제 + upsert
        const incomingHoldingIds = new Set((inv.holdings ?? []).map((h) => h.id));
        await tx.stockHolding.deleteMany({
          where: { accountId: inv.id, id: { notIn: Array.from(incomingHoldingIds).concat("") } },
        });
        for (const h of inv.holdings ?? []) {
          await tx.stockHolding.upsert({
            where: { id: h.id },
            create: {
              id: h.id,
              accountId: inv.id,
              market: h.market,
              ticker: h.ticker,
              name: h.name,
              currency: h.currency,
              quantity: h.quantity,
              memo: h.memo ?? "",
            },
            update: {
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
        const incomingCashIds = new Set((inv.cashItems ?? []).map((c) => c.id));
        await tx.cashItem.deleteMany({
          where: { accountId: inv.id, id: { notIn: Array.from(incomingCashIds).concat("") } },
        });
        for (const c of inv.cashItems ?? []) {
          await tx.cashItem.upsert({
            where: { id: c.id },
            create: {
              id: c.id,
              accountId: inv.id,
              label: c.label,
              amount: toBigInt(c.amount),
            },
            update: {
              label: c.label,
              amount: toBigInt(c.amount),
            },
          });
        }
      }
    });
  },
};
