"use client";

import { CurrencyType } from "@web/types/account.consts";
import { getNextColor as getNextColorUtil } from "@web/utils/color-selection";
import { parseNumericString } from "@web/utils/number-format";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ACCOUNT_COLORS, COLOR_FAMILIES } from "../types/constants";
import { CashItem, InvestmentItem, InvestmentRecord, StockHolding } from "../types/types";

export type HoldingsSortOption =
  | "default"
  | "priceDesc"
  | "priceAsc"
  | "evalDesc"
  | "evalAsc";

// 현재 날짜를 YYYY-MM-DD 형식으로 반환하는 헬퍼 함수
const getCurrentDate = (): string => {
  return new Date().toISOString().split("T")[0] || "";
};

// 사용 가능한 색상을 반환하는 헬퍼 함수
const getNextColor = (existingInvestments: InvestmentItem[]): string => {
  const usedColors = existingInvestments.map((inv) => inv.color).filter(Boolean);
  return getNextColorUtil(usedColors, ACCOUNT_COLORS, COLOR_FAMILIES);
};

// 투자 정보 상태 인터페이스
interface InvestmentState {
  // 데이터
  investments: InvestmentItem[];
  lastInvestmentId: number;

  // UI 상태 (LocalStorage에 저장하지 않음)
  expandedFormId: number;

  // 보유 주식 정렬 옵션 — 모든 계좌에 동일하게 적용되는 전역 UI 설정. LocalStorage 에 저장.
  holdingsSortOption: HoldingsSortOption;
  setHoldingsSortOption: (option: HoldingsSortOption) => void;

  addInvestmentWithTypeAndOwner: (accountType: string, accountOwner: string) => void;
  removeInvestment: (id: number) => void;
  updateInvestment: (id: number, field: keyof InvestmentItem, value: string | number) => void;
  addInvestmentRecord: (id: number, record?: Partial<InvestmentRecord>) => void;
  updateInvestmentRecord: (
    id: number,
    recordIndex: number,
    field: keyof InvestmentRecord,
    value: string | number
  ) => void;
  removeInvestmentRecord: (id: number, recordIndex: number) => void;
  removeInvestmentHistoryRecord: (id: number, date: string) => void;
  addHistoryRecord: (
    id: number,
    date: string,
    initialInvestment: number,
    currentValue: number
  ) => void;
  addStockHolding: (
    investmentId: number,
    initial?: {
      market: string;
      ticker: string;
      name: string;
      currency: string;
      quantity: number;
    }
  ) => void;
  updateStockHolding: (
    investmentId: number,
    holdingId: number,
    field: keyof StockHolding,
    value: string | number
  ) => void;
  setStockHoldingFromSearch: (
    investmentId: number,
    holdingId: number,
    stock: { market: string; ticker: string; name: string; currency: string }
  ) => void;
  removeStockHolding: (investmentId: number, holdingId: number) => void;
  addCashItem: (investmentId: number, initial?: { label: string; amount: number }) => void;
  updateCashItem: (
    investmentId: number,
    cashItemId: number,
    field: keyof CashItem,
    value: string | number
  ) => void;
  removeCashItem: (investmentId: number, cashItemId: number) => void;
  setExpandedFormId: (id: number) => void;
  reorderInvestments: (reorderedInvestments: InvestmentItem[]) => void;
  resetStore: () => void;
}

// 관계형 DB 구조와 호환되도록 정규화된 형태로 저장하기 위한 상태
export const useInvestmentStore = create<InvestmentState>()(
  persist(
    (set, get) => ({
      investments: [],
      customOwners: [],
      lastInvestmentId: 1,
      expandedFormId: 1,
      holdingsSortOption: "default",

      setHoldingsSortOption: (option) => set({ holdingsSortOption: option }),

      addInvestmentWithTypeAndOwner: (accountType: string, accountOwner: string) => {
        const { lastInvestmentId, investments } = get();
        const newId = lastInvestmentId + 1;
        const newColor = getNextColor(investments);

        set({
          investments: [
            {
              id: newId,
              accountName: `${accountOwner}의 ${accountType}`,
              accountType: accountType,
              accountOwner: accountOwner,
              currency: CurrencyType.KRW,
              initialInvestment: 0,
              currentValue: 0,
              records: [],
              holdings: [],
              cashItems: [],
              note: "",
              color: newColor,
            },
            ...investments,
          ],
          lastInvestmentId: newId,
          expandedFormId: newId, // 새로 추가된 폼을 자동으로 펼침
        });
      },

      removeInvestment: (id) => {
        set((state) => ({
          investments: state.investments.filter((item) => item.id !== id),
        }));
      },

      updateInvestment: (id, field, value) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== id) return item;

            // 숫자 필드 처리
            let processedValue = value;
            if (field === "initialInvestment" || field === "currentValue") {
              processedValue = typeof value === "string" ? parseNumericString(value) : value;
            }

            const updatedItem = { ...item, [field]: processedValue };

            // 투자원금 또는 평가금액이 변경되었을 때 기록 추가
            if (
              (field === "currentValue" && processedValue !== item.currentValue) ||
              (field === "initialInvestment" && processedValue !== item.initialInvestment)
            ) {
              const currentDate = getCurrentDate();
              const newRecord: InvestmentRecord = {
                date: currentDate,
                initialInvestment:
                  field === "initialInvestment"
                    ? (processedValue as number)
                    : item.initialInvestment,
                currentValue:
                  field === "currentValue" ? (processedValue as number) : item.currentValue,
              };

              // 같은 날짜의 기록이 있으면 교체, 없으면 추가
              const existingRecordIndex = item.records.findIndex(
                (record) => record.date === currentDate
              );
              if (existingRecordIndex >= 0) {
                // 같은 날짜 기록 교체
                updatedItem.records = [
                  ...item.records.slice(0, existingRecordIndex),
                  newRecord,
                  ...item.records.slice(existingRecordIndex + 1),
                ];
              } else {
                // 새 기록 추가 (최신순 정렬)
                updatedItem.records = [newRecord, ...item.records];
              }
            }

            return updatedItem;
          });

          return {
            expandedFormId: state.expandedFormId !== id ? id : state.expandedFormId,
            investments: updatedInvestments,
          };
        });
      },

      addInvestmentRecord: (id, record = {}) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== id) return item;

            // 기본값 설정: 마지막 기록의 투자원금을 가져오거나 0으로 설정
            const lastRecord = item.records[item.records.length - 1];
            const defaultRecord: InvestmentRecord = {
              date: getCurrentDate(),
              initialInvestment: lastRecord?.initialInvestment || 0,
              currentValue: 0,
              ...record,
            };

            return {
              ...item,
              records: [defaultRecord, ...item.records],
            };
          });

          return {
            investments: updatedInvestments,
          };
        });
      },

      updateInvestmentRecord: (id, recordIndex, field, value) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== id) return item;

            const updatedRecords = item.records.map((record, index) => {
              if (index !== recordIndex) return record;

              let processedValue = value;

              // 숫자 필드 처리
              if (
                (field === "initialInvestment" || field === "currentValue") &&
                typeof value === "string"
              ) {
                processedValue = value ? parseNumericString(value) : 0;
              }

              return { ...record, [field]: processedValue };
            });

            return {
              ...item,
              records: updatedRecords,
            };
          });

          return {
            investments: updatedInvestments,
          };
        });
      },

      removeInvestmentRecord: (id, recordIndex) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== id) return item;

            // 최소 1개의 기록은 유지
            if (item.records.length <= 1) return item;

            const updatedRecords = item.records.filter((_, index) => index !== recordIndex);

            return {
              ...item,
              records: updatedRecords,
            };
          });

          return {
            investments: updatedInvestments,
          };
        });
      },

      removeInvestmentHistoryRecord: (id, date) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== id) return item;

            // 해당 날짜의 기록을 삭제 (최신 기록이 아닌 경우만)
            const sortedRecords = item.records.sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );

            // 최신 기록 (첫 번째)는 삭제하지 않음
            const latestRecord = sortedRecords[0];
            if (latestRecord && latestRecord.date === date) {
              return item;
            }

            const updatedRecords = item.records.filter((record) => record.date !== date);

            return {
              ...item,
              records: updatedRecords,
            };
          });

          return {
            investments: updatedInvestments,
          };
        });
      },

      addHistoryRecord: (id, date, initialInvestment, currentValue) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== id) return item;

            // 새로운 히스토리 레코드 생성
            const newRecord: InvestmentRecord = {
              date,
              initialInvestment,
              currentValue,
            };

            // 기존 레코드에서 같은 날짜가 있는지 확인
            const existingRecordIndex = item.records.findIndex((record) => record.date === date);

            let updatedRecords;
            if (existingRecordIndex !== -1) {
              // 같은 날짜가 있으면 덮어쓰기
              updatedRecords = [...item.records];
              updatedRecords[existingRecordIndex] = newRecord;
            } else {
              // 새로운 날짜면 추가
              updatedRecords = [...item.records, newRecord];
            }

            // 날짜순으로 정렬 (최신순)
            updatedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            return {
              ...item,
              records: updatedRecords,
            };
          });

          return {
            investments: updatedInvestments,
          };
        });
      },

      addStockHolding: (investmentId, initial) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== investmentId) return item;
            const maxId = item.holdings.reduce((max, h) => Math.max(max, h.id), 0);
            const newHolding: StockHolding = {
              id: maxId + 1,
              market: initial?.market ?? "",
              ticker: initial?.ticker ?? "",
              name: initial?.name ?? "",
              currency: initial?.currency ?? "",
              quantity: initial?.quantity ?? 0,
              memo: "",
            };
            return { ...item, holdings: [...item.holdings, newHolding] };
          });
          return { investments: updatedInvestments };
        });
      },

      updateStockHolding: (investmentId, holdingId, field, value) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== investmentId) return item;
            const updatedHoldings = item.holdings.map((h) => {
              if (h.id !== holdingId) return h;
              if (field === "quantity") {
                const num = typeof value === "string" ? parseNumericString(value) : value;
                return { ...h, quantity: num };
              }
              return { ...h, [field]: value };
            });
            return { ...item, holdings: updatedHoldings };
          });
          return { investments: updatedInvestments };
        });
      },

      setStockHoldingFromSearch: (investmentId, holdingId, stock) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== investmentId) return item;
            const updatedHoldings = item.holdings.map((h) => {
              if (h.id !== holdingId) return h;
              return {
                ...h,
                market: stock.market,
                ticker: stock.ticker,
                name: stock.name,
                currency: stock.currency,
              };
            });
            return { ...item, holdings: updatedHoldings };
          });
          return { investments: updatedInvestments };
        });
      },

      removeStockHolding: (investmentId, holdingId) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== investmentId) return item;
            return { ...item, holdings: item.holdings.filter((h) => h.id !== holdingId) };
          });
          return { investments: updatedInvestments };
        });
      },

      addCashItem: (investmentId, initial) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== investmentId) return item;
            const existing = item.cashItems ?? [];
            const maxId = existing.reduce((max, c) => Math.max(max, c.id), 0);
            const newCashItem: CashItem = {
              id: maxId + 1,
              label: initial?.label ?? "예수금",
              amount: initial?.amount ?? 0,
            };
            return { ...item, cashItems: [...existing, newCashItem] };
          });
          return { investments: updatedInvestments };
        });
      },

      updateCashItem: (investmentId, cashItemId, field, value) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== investmentId) return item;
            const existing = item.cashItems ?? [];
            const updatedCashItems = existing.map((c) => {
              if (c.id !== cashItemId) return c;
              if (field === "amount") {
                const num =
                  typeof value === "string" ? (value ? parseNumericString(value) : 0) : value;
                return { ...c, amount: num };
              }
              return { ...c, [field]: value };
            });
            return { ...item, cashItems: updatedCashItems };
          });
          return { investments: updatedInvestments };
        });
      },

      removeCashItem: (investmentId, cashItemId) => {
        set((state) => {
          const updatedInvestments = state.investments.map((item) => {
            if (item.id !== investmentId) return item;
            const existing = item.cashItems ?? [];
            return { ...item, cashItems: existing.filter((c) => c.id !== cashItemId) };
          });
          return { investments: updatedInvestments };
        });
      },

      setExpandedFormId: (id) => {
        set({ expandedFormId: id });
      },

      reorderInvestments: (reorderedInvestments) => {
        set({ investments: reorderedInvestments });
      },

      resetStore: () => {
        set({
          investments: [],
          lastInvestmentId: 1,
          expandedFormId: 1,
          holdingsSortOption: "default",
        });
      },
    }),
    {
      name: "investment-storage", // localStorage에 저장될 키 이름
      storage: createJSONStorage(() => localStorage),
      version: 3,
      // UI 관련 상태는 지속성 저장에서 제외 (성능 최적화)
      partialize: (state) => ({
        investments: state.investments,
        lastInvestmentId: state.lastInvestmentId,
        holdingsSortOption: state.holdingsSortOption,
        // expandedFormId는 제외
      }),
      // 마이그레이션:
      //   v0 → v1: 만원 → 원 단위 변환
      //   v1 → v2: StockHolding 에 market/ticker/currency 기본값 주입
      //   v2 → v3: InvestmentItem 에 cashItems 기본값 주입
      migrate: (persisted, version) => {
        const state = persisted as {
          investments: InvestmentItem[];
          lastInvestmentId: number;
        };

        if (version === 0) {
          const MANWON_TO_WON = 10000;
          state.investments = state.investments.map((inv) => ({
            ...inv,
            initialInvestment: inv.initialInvestment * MANWON_TO_WON,
            currentValue: inv.currentValue * MANWON_TO_WON,
            records: inv.records.map((r) => ({
              ...r,
              initialInvestment: r.initialInvestment * MANWON_TO_WON,
              currentValue: r.currentValue * MANWON_TO_WON,
            })),
          }));
        }

        if (version < 2) {
          state.investments = state.investments.map((inv) => ({
            ...inv,
            holdings: (inv.holdings ?? []).map((h) => ({
              ...h,
              market: h.market ?? "",
              ticker: h.ticker ?? "",
              currency: h.currency ?? "",
            })),
          }));
        }

        if (version < 3) {
          state.investments = state.investments.map((inv) => ({
            ...inv,
            cashItems: inv.cashItems ?? [],
          }));
        }

        return state;
      },
      // 기존 데이터 마이그레이션: color 속성이 없는 투자에 색상 추가
      onRehydrateStorage: () => (state) => {
        if (state) {
          let needsUpdate = false;
          const updatedInvestments = state.investments.map((inv, index) => {
            let updated = inv;
            // color 속성이 없는 경우 추가
            if (!inv.color) {
              needsUpdate = true;
              updated = {
                ...updated,
                color: ACCOUNT_COLORS[index % ACCOUNT_COLORS.length] || "#3b82f6",
              };
            }
            // holdings 속성이 없는 경우 추가
            if (!inv.holdings) {
              needsUpdate = true;
              updated = { ...updated, holdings: [] };
            }
            // cashItems 속성이 없는 경우 추가
            if (!inv.cashItems) {
              needsUpdate = true;
              updated = { ...updated, cashItems: [] };
            }
            return updated;
          });

          if (needsUpdate) {
            state.investments = updatedInvestments;
          }
        }
      },
    }
  )
);
