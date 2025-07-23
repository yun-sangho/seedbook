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
      // 날짜 객체를 JSON으로 직렬화/역직렬화하기 위한 설정
      partialize: (state) => ({
        plans: state.plans.map((plan) => ({
          ...plan,
          createdAt: plan.createdAt.toISOString(),
          updatedAt: plan.updatedAt.toISOString(),
        })),
      }),
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
