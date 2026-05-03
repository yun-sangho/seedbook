import { schema } from "@seedbook/database";
import { and, eq, notInArray } from "drizzle-orm";
import { bigIntToNumber, toBigInt, type DomainTranslator, type Envelope } from "./types";

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
  createdAt: string;
  updatedAt: string;
  accountPlans: Record<string, AccountItemPayload>;
  totalMonthlyContribution: number;
  averageTargetReturn: number;
};

export const assetPlanTranslator: DomainTranslator = {
  async read(db, userId) {
    const [plans, listOrder] = await Promise.all([
      db.query.assetPlan.findMany({
        where: (t, { eq }) => eq(t.userId, userId),
        with: { accountItems: true },
      }),
      db.query.userListOrder.findFirst({
        where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.domain, DOMAIN)),
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

  async write(db, userId, envelope) {
    const state = envelope.state ?? {};
    const plans = Array.isArray(state.plans) ? (state.plans as AssetPlanPayload[]) : [];

    await db.transaction(async (tx) => {
      const order = plans.map((p) => p.id);
      await tx
        .insert(schema.userListOrder)
        .values({ userId, domain: DOMAIN, order })
        .onConflictDoUpdate({
          target: [schema.userListOrder.userId, schema.userListOrder.domain],
          set: { order },
        });

      const incomingIds = plans.map((p) => p.id);
      if (incomingIds.length > 0) {
        await tx
          .delete(schema.assetPlan)
          .where(
            and(eq(schema.assetPlan.userId, userId), notInArray(schema.assetPlan.id, incomingIds)),
          );
      } else {
        await tx.delete(schema.assetPlan).where(eq(schema.assetPlan.userId, userId));
      }

      for (const p of plans) {
        const createdAt = new Date(p.createdAt);
        const updatedAt = new Date(p.updatedAt);
        await tx
          .insert(schema.assetPlan)
          .values({
            id: p.id,
            userId,
            planName: p.planName,
            planPeriod: p.planPeriod,
            totalMonthlyContribution: toBigInt(p.totalMonthlyContribution),
            averageTargetReturn: p.averageTargetReturn,
            createdAt,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: schema.assetPlan.id,
            set: {
              planName: p.planName,
              planPeriod: p.planPeriod,
              totalMonthlyContribution: toBigInt(p.totalMonthlyContribution),
              averageTargetReturn: p.averageTargetReturn,
              updatedAt,
            },
          });

        // AccountItems: 전체 교체 (한 plan 의 항목 수는 수십 건 이하로 가정)
        await tx
          .delete(schema.assetPlanAccountItem)
          .where(eq(schema.assetPlanAccountItem.planId, p.id));
        const itemRows = Object.entries(p.accountPlans ?? {}).map(([accountId, item]) => ({
          planId: p.id,
          accountId,
          accountKind: item.accountKind ?? "investment",
          contributionAmount: toBigInt(
            parseFloat((item.contributionAmount ?? "0").replace(/,/g, "")),
          ),
          contributionFrequency: item.contributionFrequency,
          targetAnnualReturn: parseFloat(item.targetAnnualReturn ?? "0"),
        }));
        if (itemRows.length > 0) {
          await tx.insert(schema.assetPlanAccountItem).values(itemRows).onConflictDoNothing();
        }
      }
    });
  },
};
