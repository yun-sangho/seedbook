import { createHybridStorage } from "@web/lib/hybrid-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { AssetPlan, AssetPlanStore } from "../types/types";

export const useAssetPlanStore = create<AssetPlanStore>()(
  persist(
    (set, get) => ({
      plans: [],

      addPlan: (planData) => {
        const newPlan: AssetPlan = {
          ...planData,
          id: crypto.randomUUID(),
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
      storage: createJSONStorage(() => createHybridStorage("asset-plan-storage")),
      version: 2,
      // 날짜 객체를 JSON으로 직렬화/역직렬화하기 위한 설정
      partialize: (state) => ({
        plans: state.plans.map((plan) => ({
          ...plan,
          createdAt: plan.createdAt.toISOString(),
          updatedAt: plan.updatedAt.toISOString(),
        })),
      }),
      // v0~v1 → v2 정규화 마이그레이션은 `lib/local-id-upgrade.ts` 가 선행
      // 실행되어 accountPlans 의 숫자 키를 투자/저축 UUID 로 변환 + accountKind
      // discriminator 를 주입한다. 여기는 방어망 + 누락 필드 보정만.
      migrate: (persisted) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = persisted as any;
        if (!state.plans) state.plans = [];
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
