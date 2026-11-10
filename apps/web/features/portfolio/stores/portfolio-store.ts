"use client";

import { ACCOUNT_COLORS, COLOR_FAMILIES } from "@web/features/investments/types/constants";
import { createHybridStorage } from "@web/lib/hybrid-storage";
import { getNextColor as getNextColorUtil } from "@web/utils/color-selection";
import { parseNumericString } from "@web/utils/number-format";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_DRIFT_MODE,
  DEFAULT_DRIFT_THRESHOLD_PERCENT,
  DEFAULT_PORTFOLIO_NAME_PREFIX,
  LEGACY_DRIFT_MODE,
} from "../types/constants";
import type { DriftMode, PortfolioAllocation, PortfolioItem, StockSelection } from "../types/types";
import { dedupePortfolioLinks } from "../utils/portfolio-links";

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
  setAllocationStockFromSearch: (
    portfolioId: string,
    allocationId: string,
    stock: StockSelection
  ) => void;
  removeAllocation: (portfolioId: string, allocationId: string) => void;

  setPortfolioAccountIds: (portfolioId: string, accountIds: string[]) => void;
  toggleAccountLink: (portfolioId: string, accountId: string) => void;
  setDriftThreshold: (portfolioId: string, value: number) => void;
  setDriftMode: (portfolioId: string, mode: DriftMode) => void;

  reorderPortfolios: (reordered: PortfolioItem[]) => void;
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

      reorderPortfolios: (reordered) => {
        set({ portfolios: reordered });
      },

      resetStore: () => {
        set({ portfolios: [] });
      },
    }),
    {
      name: "portfolio-storage",
      storage: createJSONStorage(() => createHybridStorage("portfolio-storage")),
      version: 3,
      partialize: (state) => ({
        portfolios: state.portfolios,
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
        if (version < 3) {
          // v3: 한 계좌는 하나의 포트폴리오에만 연결된다.
          state.portfolios = dedupePortfolioLinks(state.portfolios ?? []);
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
          // 계산 방식이 생기기 전 포트폴리오는 그때처럼 %p 차이로 판정한다.
          driftMode: p.driftMode ?? LEGACY_DRIFT_MODE,
          driftThresholdPercent: p.driftThresholdPercent ?? DEFAULT_DRIFT_THRESHOLD_PERCENT,
          note: p.note ?? "",
          createdAt: p.createdAt ?? nowIso(),
          updatedAt: p.updatedAt ?? nowIso(),
        }));
      },
    }
  )
);
