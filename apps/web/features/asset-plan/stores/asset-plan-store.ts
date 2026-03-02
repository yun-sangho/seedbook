import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AssetPlan, AssetPlanStore } from "../types/types";

export const useAssetPlanStore = create<AssetPlanStore>()(
  persist(
    (set, get) => ({
      plans: [],

      addPlan: (planData) => {
        const newPlan: AssetPlan = {
          ...planData,
          id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        set((state) => ({
          plans: [...state.plans, newPlan],
        }));
      },

      updatePlan: (id, updates) => {
        set((state) => ({
          plans: state.plans.map((plan) =>
            plan.id === id ? { ...plan, ...updates, updatedAt: new Date() } : plan
          ),
        }));
      },

      deletePlan: (id) => {
        set((state) => ({
          plans: state.plans.filter((plan) => plan.id !== id),
        }));
      },

      getPlanById: (id) => {
        return get().plans.find((plan) => plan.id === id);
      },
    }),
    {
      name: "asset-plan-storage",
      version: 1,
      // 날짜 객체를 JSON으로 직렬화/역직렬화하기 위한 설정
      partialize: (state) => ({
        plans: state.plans.map((plan) => ({
          ...plan,
          createdAt: plan.createdAt.toISOString(),
          updatedAt: plan.updatedAt.toISOString(),
        })),
      }),
      // 만원 → 원 마이그레이션
      migrate: (persisted, version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = persisted as any;
        if (version === 0 && state.plans) {
          const MANWON_TO_WON = 10000;
          state.plans = state.plans.map((plan: Record<string, unknown>) => ({
            ...plan,
            totalMonthlyContribution:
              (plan.totalMonthlyContribution as number) * MANWON_TO_WON,
            accountPlans: Object.fromEntries(
              Object.entries(
                plan.accountPlans as Record<
                  string,
                  { contributionAmount: string; contributionFrequency: string; targetAnnualReturn: string }
                >
              ).map(([id, ap]) => [
                id,
                {
                  ...ap,
                  contributionAmount: String(
                    parseFloat(ap.contributionAmount.replace(/,/g, "")) * MANWON_TO_WON
                  ),
                },
              ])
            ),
          }));
        }
        return state;
      },
      // 로컬스토리지에서 읽어올 때 날짜 객체로 복원
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.plans = state.plans.map((plan) => ({
            ...plan,
            createdAt: new Date(plan.createdAt as unknown as string),
            updatedAt: new Date(plan.updatedAt as unknown as string),
          }));
        }
      },
    }
  )
);
