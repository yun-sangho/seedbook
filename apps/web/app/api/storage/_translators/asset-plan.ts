import { type DomainTranslator, type Envelope, bigIntToNumber, toBigInt } from "./types";

const DOMAIN = "asset-plans";
const VERSION = 2;

type AccountItemPayload = {
  contributionAmount: string;
  contributionFrequency: string;
  targetAnnualReturn: string;
  accountKind?: "investment" | "savings";
};

type AssetPlanPayload = {
  id: string;
  planName: string;
  planPeriod: number;
  createdAt: string; // ISO string
  updatedAt: string;
  accountPlans: Record<string, AccountItemPayload>;
  totalMonthlyContribution: number;
  averageTargetReturn: number;
};

export const assetPlanTranslator: DomainTranslator = {
  async read(prisma, userId) {
    const [plans, listOrder] = await Promise.all([
      prisma.assetPlan.findMany({
        where: { userId },
        include: { accountItems: true },
      }),
      prisma.userListOrder.findUnique({
        where: { userId_domain: { userId, domain: DOMAIN } },
      }),
    ]);

    if (plans.length === 0 && !listOrder) return null;

    const orderIndex = new Map<string, number>();
    (listOrder?.order ?? []).forEach((id, idx) => orderIndex.set(id, idx));
    const sorted = plans.slice().sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    const planPayloads: AssetPlanPayload[] = sorted.map((p) => {
      const accountPlans: Record<string, AccountItemPayload> = {};
      for (const item of p.accountItems) {
        accountPlans[item.accountId] = {
          contributionAmount: bigIntToNumber(item.contributionAmount).toString(),
          contributionFrequency: item.contributionFrequency,
          targetAnnualReturn: item.targetAnnualReturn.toString(),
          accountKind: item.accountKind as "investment" | "savings",
        };
      }
      return {
        id: p.id,
        planName: p.planName,
        planPeriod: p.planPeriod,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        accountPlans,
        totalMonthlyContribution: bigIntToNumber(p.totalMonthlyContribution),
        averageTargetReturn: p.averageTargetReturn,
      };
    });

    const envelope: Envelope = {
      state: { plans: planPayloads },
      version: VERSION,
    };
    return envelope;
  },

  async write(prisma, userId, envelope) {
    const state = envelope.state ?? {};
    const plans = Array.isArray(state.plans) ? (state.plans as AssetPlanPayload[]) : [];

    await prisma.$transaction(async (tx) => {
      const order = plans.map((p) => p.id);
      await tx.userListOrder.upsert({
        where: { userId_domain: { userId, domain: DOMAIN } },
        create: { userId, domain: DOMAIN, order },
        update: { order },
      });

      const incomingIds = new Set(plans.map((p) => p.id));
      const existingIds = (
        await tx.assetPlan.findMany({ where: { userId }, select: { id: true } })
      ).map((r) => r.id);
      const toDelete = existingIds.filter((id) => !incomingIds.has(id));
      if (toDelete.length > 0) {
        await tx.assetPlan.deleteMany({ where: { id: { in: toDelete } } });
      }

      for (const p of plans) {
        const createdAt = new Date(p.createdAt);
        const updatedAt = new Date(p.updatedAt);
        await tx.assetPlan.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            userId,
            planName: p.planName,
            planPeriod: p.planPeriod,
            totalMonthlyContribution: toBigInt(p.totalMonthlyContribution),
            averageTargetReturn: p.averageTargetReturn,
            createdAt,
            updatedAt,
          },
          update: {
            planName: p.planName,
            planPeriod: p.planPeriod,
            totalMonthlyContribution: toBigInt(p.totalMonthlyContribution),
            averageTargetReturn: p.averageTargetReturn,
            updatedAt,
          },
        });

        // AccountItems: 전체 교체 (한 plan 의 항목 수는 수십 건 이하로 가정)
        await tx.assetPlanAccountItem.deleteMany({ where: { planId: p.id } });
        const itemRows = Object.entries(p.accountPlans ?? {}).map(([accountId, item]) => ({
          planId: p.id,
          accountId,
          accountKind: item.accountKind ?? "investment",
          contributionAmount: toBigInt(
            parseFloat((item.contributionAmount ?? "0").replace(/,/g, ""))
          ),
          contributionFrequency: item.contributionFrequency,
          targetAnnualReturn: parseFloat(item.targetAnnualReturn ?? "0"),
        }));
        if (itemRows.length > 0) {
          await tx.assetPlanAccountItem.createMany({ data: itemRows, skipDuplicates: true });
        }
      }
    });
  },
};
