"use client";

import { ACCOUNT_COLORS, COLOR_FAMILIES } from "@web/features/investments/types/constants";
import { createHybridStorage } from "@web/lib/hybrid-storage";
import { getNextColor as getNextColorUtil } from "@web/utils/color-selection";
import { parseNumericString } from "@web/utils/number-format";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_DRIFT_THRESHOLD_PERCENT, DEFAULT_PORTFOLIO_NAMES } from "../types/constants";
import type { PortfolioAllocation, PortfolioItem, StockSelection } from "../types/types";

const nowIso = () => new Date().toISOString();

const getNextColor = (existing: PortfolioItem[]): string => {
  const used = existing.map((p) => p.color).filter(Boolean);
  return getNextColorUtil(used, ACCOUNT_COLORS, COLOR_FAMILIES);
};

const nextDefaultName = (existing: PortfolioItem[]): string => {
  const used = new Set(existing.map((p) => p.name));
  for (const candidate of DEFAULT_PORTFOLIO_NAMES) {
    if (!used.has(candidate)) return candidate;
  }
  return `포트폴리오 ${existing.length + 1}`;
};

interface PortfolioState {
  portfolios: PortfolioItem[];
  expandedFormId: string;

  addPortfolio: (name?: string) => string;
  removePortfolio: (id: string) => void;
  updatePortfolio: (
    id: string,
    field: "name" | "description" | "note" | "color",
    value: string
  ) => void;

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
  setAllocationStockFromSearch: (
    portfolioId: string,
    allocationId: string,
    stock: StockSelection
  ) => void;
  removeAllocation: (portfolioId: string, allocationId: string) => void;

  setPortfolioAccountIds: (portfolioId: string, accountIds: string[]) => void;
  toggleAccountLink: (portfolioId: string, accountId: string) => void;
  setDriftThreshold: (portfolioId: string, value: number) => void;

  reorderPortfolios: (reordered: PortfolioItem[]) => void;
  setExpandedFormId: (id: string) => void;
  resetStore: () => void;
}

const touch = (p: PortfolioItem): PortfolioItem => ({ ...p, updatedAt: nowIso() });

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      portfolios: [],
      expandedFormId: "",

      addPortfolio: (name) => {
        const { portfolios } = get();
        const id = crypto.randomUUID();
        const newPortfolio: PortfolioItem = {
          id,
          name: name && name.trim().length > 0 ? name.trim() : nextDefaultName(portfolios),
          description: "",
          color: getNextColor(portfolios),
          allocations: [],
          accountIds: [],
          driftThresholdPercent: DEFAULT_DRIFT_THRESHOLD_PERCENT,
          note: "",
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        set({
          portfolios: [newPortfolio, ...portfolios],
          expandedFormId: id,
        });
        return id;
      },

      removePortfolio: (id) => {
        set((state) => ({
          portfolios: state.portfolios.filter((p) => p.id !== id),
          expandedFormId: state.expandedFormId === id ? "" : state.expandedFormId,
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

      setAllocationStockFromSearch: (portfolioId, allocationId, stock) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) => {
            if (p.id !== portfolioId) return p;
            const allocations = p.allocations.map((a) =>
              a.id === allocationId
                ? {
                    ...a,
                    market: stock.market,
                    ticker: stock.ticker,
                    name: stock.name,
                    currency: stock.currency,
                  }
                : a
            );
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
            p.id === portfolioId ? touch({ ...p, accountIds: unique }) : p
          ),
        }));
      },

      toggleAccountLink: (portfolioId, accountId) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) => {
            if (p.id !== portfolioId) return p;
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

      reorderPortfolios: (reordered) => {
        set({ portfolios: reordered });
      },

      setExpandedFormId: (id) => {
        set({ expandedFormId: id });
      },

      resetStore: () => {
        set({ portfolios: [], expandedFormId: "" });
      },
    }),
    {
      name: "portfolio-storage",
      storage: createJSONStorage(() => createHybridStorage("portfolio-storage")),
      version: 2,
      partialize: (state) => ({
        portfolios: state.portfolios,
        // expandedFormId 는 UI 상태라 저장 안 함
      }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as { portfolios?: PortfolioItem[] };
        if (version < 2) {
          state.portfolios = (state.portfolios ?? []).map((p) => ({
            ...p,
            accountIds: p.accountIds ?? [],
            driftThresholdPercent: p.driftThresholdPercent ?? DEFAULT_DRIFT_THRESHOLD_PERCENT,
          }));
        }
        return state;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.portfolios = (state.portfolios ?? []).map((p, i) => ({
          ...p,
          color: p.color || ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] || "#3b82f6",
          allocations: p.allocations ?? [],
          accountIds: p.accountIds ?? [],
          driftThresholdPercent: p.driftThresholdPercent ?? DEFAULT_DRIFT_THRESHOLD_PERCENT,
          note: p.note ?? "",
          description: p.description ?? "",
          createdAt: p.createdAt ?? nowIso(),
          updatedAt: p.updatedAt ?? nowIso(),
        }));
      },
    }
  )
);
