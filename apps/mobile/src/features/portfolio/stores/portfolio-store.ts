"use client";

import { useHarvestStore } from "@mobile/features/garden/stores/harvest-store";
import { kindForPortfolio } from "@mobile/features/garden/utils/garden-home";
import { ACCOUNT_COLORS, COLOR_FAMILIES } from "@mobile/features/investments/types/constants";
import { createHybridStorage } from "@mobile/lib/hybrid-storage";
import { getNextColor as getNextColorUtil } from "@mobile/utils/color-selection";
import { parseNumericString } from "@mobile/utils/number-format";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_DRIFT_MODE,
  DEFAULT_DRIFT_THRESHOLD_PERCENT,
  DEFAULT_PORTFOLIO_NAME_PREFIX,
  INITIAL_PLANT_PROGRESS,
  LEGACY_DRIFT_MODE,
} from "../types/constants";
import type { DriftMode, PlantKind, PortfolioAllocation, PortfolioItem } from "../types/types";
import {
  evaluatePlant,
  harvestPlant,
  nextGoalError,
  type PlantEvaluation,
  startPlantSeason,
  wishError,
} from "../utils/plant-season";
import { type PortfolioValuation, readPlantProgress } from "../utils/portfolio-plant";

const nowIso = () => new Date().toISOString();

const getNextColor = (existing: PortfolioItem[]): string => {
  const used = existing.map((p) => p.color).filter(Boolean);
  return getNextColorUtil(used, ACCOUNT_COLORS, COLOR_FAMILIES);
};

/** "포트폴리오 N" 중 아직 쓰이지 않은 가장 작은 N 을 고른다. */
const nextDefaultName = (existing: PortfolioItem[]): string => {
  const used = new Set(existing.map((p) => p.name));
  let n = 1;
  while (used.has(`${DEFAULT_PORTFOLIO_NAME_PREFIX} ${n}`)) n++;
  return `${DEFAULT_PORTFOLIO_NAME_PREFIX} ${n}`;
};

interface PortfolioState {
  portfolios: PortfolioItem[];

  addPortfolio: (name?: string) => string;
  removePortfolio: (id: string) => void;
  updatePortfolio: (id: string, field: "name" | "note" | "color", value: string) => void;

  addAllocation: (
    portfolioId: string,
    initial?: Partial<
      Pick<PortfolioAllocation, "market" | "ticker" | "name" | "currency" | "targetPercent">
    >
  ) => void;
  updateAllocation: (
    portfolioId: string,
    allocationId: string,
    field: keyof PortfolioAllocation,
    value: string | number
  ) => void;
  removeAllocation: (portfolioId: string, allocationId: string) => void;

  setPortfolioAccountIds: (portfolioId: string, accountIds: string[]) => void;
  toggleAccountLink: (portfolioId: string, accountId: string) => void;
  setDriftThreshold: (portfolioId: string, value: number) => void;
  setDriftMode: (portfolioId: string, mode: DriftMode) => void;
  /**
   * 식물의 지금 목표 금액 (원, 4단계면 열매 목표) 을 정한다. `null` 이면 목표를 지운다. 지금 평가
   * (`valuation`) 로 본 규칙(`nextGoalError`: 하한 +10%, 시세 다 옴, 열매 전)에 어긋나면 바꾸지 않고 false.
   */
  setPlantGoal: (
    portfolioId: string,
    amount: number | null,
    valuation: Pick<PortfolioValuation, "value" | "pricesComplete">
  ) => boolean;
  /**
   * 포트폴리오 평가 (id → 평가) 로 식물을 평가한다 (`evaluatePlant`: 목표를 이룬 식물은 한 단계 자라고,
   * 이탈 시작일을 기록·해제한다). 바뀐 것이 없으면 상태를 바꾸지 않는다 (동기화 대기열에도 남지 않는다).
   */
  evaluatePlants: (evaluations: ReadonlyMap<string, PlantEvaluation>, now?: string) => void;
  /** 씨앗 심기 — 이번 계절의 식물 종류와 소원. 소원이 규칙(`wishError`)에 어긋나면 false. */
  startPlantSeason: (portfolioId: string, input: { plantKind: PlantKind; wish: string }) => boolean;
  /** 이번 계절의 소원을 고친다. 규칙에 어긋나면 false. */
  setPlantWish: (portfolioId: string, wish: string) => boolean;
  /**
   * 열매가 열린 식물을 수확한다 — 수확 기록을 바구니(`useHarvestStore`)에 남기고 다음 계절 씨앗으로
   * 되돌린다. 수확 기록 id 를 돌려주고, 익지 않았으면 아무것도 바꾸지 않고 null.
   */
  harvestPlant: (portfolioId: string) => string | null;

  resetStore: () => void;
}

const touch = (p: PortfolioItem): PortfolioItem => ({ ...p, updatedAt: nowIso() });

/**
 * 한 계좌는 하나의 포트폴리오에만 연결된다 — 다른 포트폴리오에 연결하면 기존 연결에서
 * 빠진다. 해당 계좌가 없던 포트폴리오는 같은 참조를 그대로 돌려준다.
 */
const withoutAccounts = (p: PortfolioItem, accountIds: Set<string>): PortfolioItem =>
  p.accountIds.some((id) => accountIds.has(id))
    ? touch({ ...p, accountIds: p.accountIds.filter((id) => !accountIds.has(id)) })
    : p;

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      portfolios: [],

      addPortfolio: (name) => {
        const { portfolios } = get();
        const id = crypto.randomUUID();
        const newPortfolio: PortfolioItem = {
          id,
          name: name && name.trim().length > 0 ? name.trim() : nextDefaultName(portfolios),
          color: getNextColor(portfolios),
          allocations: [],
          accountIds: [],
          driftMode: DEFAULT_DRIFT_MODE,
          driftThresholdPercent: DEFAULT_DRIFT_THRESHOLD_PERCENT,
          ...INITIAL_PLANT_PROGRESS,
          note: "",
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        set({
          portfolios: [newPortfolio, ...portfolios],
        });
        return id;
      },

      removePortfolio: (id) => {
        set((state) => ({
          portfolios: state.portfolios.filter((p) => p.id !== id),
        }));
      },

      updatePortfolio: (id, field, value) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === id ? touch({ ...p, [field]: value }) : p
          ),
        }));
      },

      addAllocation: (portfolioId, initial) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) => {
            if (p.id !== portfolioId) return p;
            const newAllocation: PortfolioAllocation = {
              id: crypto.randomUUID(),
              market: initial?.market ?? "",
              ticker: initial?.ticker ?? "",
              name: initial?.name ?? "",
              currency: initial?.currency ?? "",
              targetPercent: initial?.targetPercent ?? 0,
            };
            return touch({ ...p, allocations: [...p.allocations, newAllocation] });
          }),
        }));
      },

      updateAllocation: (portfolioId, allocationId, field, value) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) => {
            if (p.id !== portfolioId) return p;
            const allocations = p.allocations.map((a) => {
              if (a.id !== allocationId) return a;
              if (field === "targetPercent") {
                const num =
                  typeof value === "string"
                    ? value === ""
                      ? 0
                      : parseNumericString(value)
                    : value;
                return { ...a, targetPercent: Number.isFinite(num) ? num : 0 };
              }
              return { ...a, [field]: value };
            });
            return touch({ ...p, allocations });
          }),
        }));
      },

      removeAllocation: (portfolioId, allocationId) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId
              ? touch({ ...p, allocations: p.allocations.filter((a) => a.id !== allocationId) })
              : p
          ),
        }));
      },

      setPortfolioAccountIds: (portfolioId, accountIds) => {
        const unique = Array.from(new Set(accountIds));
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId
              ? touch({ ...p, accountIds: unique })
              : withoutAccounts(p, new Set(unique))
          ),
        }));
      },

      toggleAccountLink: (portfolioId, accountId) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) => {
            if (p.id !== portfolioId) return withoutAccounts(p, new Set([accountId]));
            const has = p.accountIds.includes(accountId);
            const next = has
              ? p.accountIds.filter((id) => id !== accountId)
              : [...p.accountIds, accountId];
            return touch({ ...p, accountIds: next });
          }),
        }));
      },

      setDriftThreshold: (portfolioId, value) => {
        const clamped = Number.isFinite(value)
          ? Math.max(0, value)
          : DEFAULT_DRIFT_THRESHOLD_PERCENT;
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId ? touch({ ...p, driftThresholdPercent: clamped }) : p
          ),
        }));
      },

      setDriftMode: (portfolioId, mode) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId ? touch({ ...p, driftMode: mode }) : p
          ),
        }));
      },

      setPlantGoal: (portfolioId, amount, valuation) => {
        const portfolio = get().portfolios.find((p) => p.id === portfolioId);
        if (!portfolio) return false;
        if (amount !== null && nextGoalError(portfolio, amount, valuation)) return false;
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId ? touch({ ...p, goalAmount: amount }) : p
          ),
        }));
        return true;
      },

      evaluatePlants: (evaluations, now = nowIso()) => {
        const { portfolios } = get();
        const next = portfolios.map((p) => {
          const evaluation = evaluations.get(p.id);
          if (evaluation === undefined) return p;
          const evaluated = evaluatePlant(p, evaluation, now);
          return evaluated === p ? p : touch(evaluated);
        });
        if (next.some((p, i) => p !== portfolios[i])) set({ portfolios: next });
      },

      startPlantSeason: (portfolioId, input) => {
        if (wishError(input.wish)) return false;
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId ? touch(startPlantSeason(p, input)) : p
          ),
        }));
        return true;
      },

      setPlantWish: (portfolioId, wish) => {
        if (wishError(wish)) return false;
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId ? touch({ ...p, wish: wish.trim() }) : p
          ),
        }));
        return true;
      },

      harvestPlant: (portfolioId) => {
        const portfolio = get().portfolios.find((p) => p.id === portfolioId);
        if (!portfolio) return null;
        const result = harvestPlant(portfolio, kindForPortfolio(portfolio.id), nowIso());
        if (!result) return null;
        useHarvestStore.getState().addHarvest(result.harvest);
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId ? touch(result.progress) : p
          ),
        }));
        return result.harvest.id;
      },

      resetStore: () => {
        set({ portfolios: [] });
      },
    }),
    {
      name: "portfolio-storage",
      storage: createJSONStorage(() => createHybridStorage("portfolio-storage")),
      partialize: (state) => ({
        portfolios: state.portfolios,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.portfolios = (state.portfolios ?? []).map((p, i) => ({
          ...p,
          color: p.color || ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] || "#3b82f6",
          allocations: p.allocations ?? [],
          accountIds: p.accountIds ?? [],
          // 계산 방식이 생기기 전 포트폴리오는 그때처럼 %p 차이로 판정한다.
          driftMode: p.driftMode ?? LEGACY_DRIFT_MODE,
          driftThresholdPercent: p.driftThresholdPercent ?? DEFAULT_DRIFT_THRESHOLD_PERCENT,
          // 식물이 생기기 전 포트폴리오는 씨앗이다.
          ...readPlantProgress(p),
          note: p.note ?? "",
          createdAt: p.createdAt ?? nowIso(),
          updatedAt: p.updatedAt ?? nowIso(),
        }));
      },
    }
  )
);
