"use client";

import { createHybridStorage } from "@mobile/lib/hybrid-storage";
import { CurrencyType } from "@mobile/types/account.consts";
import { getNextColor as getNextColorUtil } from "@mobile/utils/color-selection";
import { parseNumericString } from "@mobile/utils/number-format";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ACCOUNT_COLORS, COLOR_FAMILIES } from "../types/constants";
import type { CashItem, InvestmentItem, InvestmentRecord, StockHolding } from "../types/types";
import type { HoldingSeed } from "../utils/holding-seeds";

export type { HoldingsSortOption } from "../types/holdings-sort";

// 현재 날짜를 YYYY-MM-DD 형식으로 반환하는 헬퍼 함수
const getCurrentDate = (): string => {
  return new Date().toISOString().split("T")[0] || "";
};

export const DEFAULT_CASH_LABEL = "예수금";

// 계좌마다 기본으로 두는 예수금 항목
const createDefaultCashItem = (): CashItem => ({
  id: crypto.randomUUID(),
  label: DEFAULT_CASH_LABEL,
  amount: 0,
});

// 사용 가능한 색상을 반환하는 헬퍼 함수
const getNextColor = (existingInvestments: InvestmentItem[]): string => {
  const usedColors = existingInvestments.map((inv) => inv.color).filter(Boolean);
  return getNextColorUtil(usedColors, ACCOUNT_COLORS, COLOR_FAMILIES);
};

// 투자 정보 상태 인터페이스
interface InvestmentState {
  // 데이터
  investments: InvestmentItem[];

  /** 새 계좌를 맨 앞에 추가하고 id 를 돌려준다. `holdings` 로 시작 종목을 넣을 수 있다. */
  addInvestmentWithType: (accountType: string, options?: { holdings?: HoldingSeed[] }) => string;
  removeInvestment: (id: string) => void;
  updateInvestment: (id: string, field: keyof InvestmentItem, value: string | number) => void;
  addInvestmentRecord: (id: string, record?: Partial<InvestmentRecord>) => void;
  updateInvestmentRecord: (
    id: string,
    recordIndex: number,
    field: keyof InvestmentRecord,
    value: string | number
  ) => void;
  removeInvestmentRecord: (id: string, recordIndex: number) => void;
  removeInvestmentHistoryRecord: (id: string, date: string) => void;
  addHistoryRecord: (
    id: string,
    date: string,
    initialInvestment: number,
    currentValue: number
  ) => void;
  addStockHolding: (
    investmentId: string,
    initial?: {
      market: string;
      ticker: string;
      name: string;
      currency: string;
      quantity: number;
    }
  ) => void;
  updateStockHolding: (
    investmentId: string,
    holdingId: string,
    field: keyof StockHolding,
    value: string | number
  ) => void;
  removeStockHolding: (investmentId: string, holdingId: string) => void;
  addCashItem: (investmentId: string, initial?: { label: string; amount: number }) => void;
  updateCashItem: (
    investmentId: string,
    cashItemId: string,
    field: keyof CashItem,
    value: string | number
  ) => void;
  removeCashItem: (investmentId: string, cashItemId: string) => void;
  /** 같은 id 의 계좌를 통째로 바꾼다 (리밸런싱 반영처럼 여러 필드를 한 번에 고칠 때). */
  replaceInvestment: (item: InvestmentItem) => void;
  resetStore: () => void;
}

// 관계형 DB 구조와 호환되도록 정규화된 형태로 저장하기 위한 상태
export const useInvestmentStore = create<InvestmentState>()(
  persist(
    (set, get) => ({
      investments: [],

      addInvestmentWithType: (accountType, options) => {
        const { investments } = get();
        const newId = crypto.randomUUID();
        const newColor = getNextColor(investments);

        set({
          investments: [
            {
              id: newId,
              accountName: `${accountType} ${investments.length + 1}`,
              accountType: accountType,
              currency: CurrencyType.KRW,
              initialInvestment: 0,
              currentValue: 0,
              records: [],
              holdings: (options?.holdings ?? []).map((seed) => ({
                ...seed,
                id: crypto.randomUUID(),
                memo: "",
              })),
              // 모든 계좌는 예수금 항목 하나를 기본으로 가진다.
              cashItems: [createDefaultCashItem()],
              note: "",
              color: newColor,
            },
            ...investments,
          ],
        });
        return newId;
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

          return { investments: updatedInvestments };
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

            let updatedRecords: InvestmentRecord[];
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
            const newHolding: StockHolding = {
              id: crypto.randomUUID(),
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
            const newCashItem: CashItem = {
              id: crypto.randomUUID(),
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

      replaceInvestment: (item) => {
        set((state) => ({
          investments: state.investments.map((inv) => (inv.id === item.id ? item : inv)),
        }));
      },

      resetStore: () => {
        set({ investments: [] });
      },
    }),
    {
      // 기기 레코드에 둔다 (`lib/hybrid-storage.ts`). persist version 은 두지 않는다 — 모양은 레코드 정의가 정한다.
      name: "investment-storage",
      storage: createJSONStorage(() => createHybridStorage("investment-storage")),
      // 보유 종목 정렬 같은 화면 설정은 계정 설정(`lib/preferences-store.ts`)에 둔다.
      partialize: (state) => ({ investments: state.investments }),
      // 예전 버전이 계좌와 함께 저장한 보유 종목 정렬은 버린다 (지금은 계정 설정).
      merge: (persisted, current) => {
        const { holdingsSortOption: _, ...saved } = (persisted ??
          {}) as Partial<InvestmentState> & {
          holdingsSortOption?: unknown;
        };
        return { ...current, ...saved };
      },
      onRehydrateStorage: () => (state) => {
        // color 누락 방어 — 이전 버전에서 추가되지 않은 투자 계좌가 있을 수 있음
        if (state) {
          state.investments = state.investments.map((inv, index) => ({
            ...inv,
            color: inv.color || ACCOUNT_COLORS[index % ACCOUNT_COLORS.length] || "#3b82f6",
            holdings: inv.holdings ?? [],
            cashItems: inv.cashItems ?? [],
          }));
        }
      },
    }
  )
);
