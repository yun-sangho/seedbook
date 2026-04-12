"use client";

import { createHybridStorage } from "@web/lib/hybrid-storage";
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

  // UI 상태 (LocalStorage에 저장하지 않음). 빈 문자열이면 "펼친 폼 없음".
  expandedFormId: string;

  // 보유 주식 정렬 옵션 — 모든 계좌에 동일하게 적용되는 전역 UI 설정. LocalStorage 에 저장.
  holdingsSortOption: HoldingsSortOption;
  setHoldingsSortOption: (option: HoldingsSortOption) => void;

  addInvestmentWithTypeAndOwner: (accountType: string, accountOwner: string) => void;
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
  setStockHoldingFromSearch: (
    investmentId: string,
    holdingId: string,
    stock: { market: string; ticker: string; name: string; currency: string }
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
  setExpandedFormId: (id: string) => void;
  reorderInvestments: (reorderedInvestments: InvestmentItem[]) => void;
  resetStore: () => void;
}

// 관계형 DB 구조와 호환되도록 정규화된 형태로 저장하기 위한 상태
export const useInvestmentStore = create<InvestmentState>()(
  persist(
    (set, get) => ({
      investments: [],
      expandedFormId: "",
      holdingsSortOption: "default",

      setHoldingsSortOption: (option) => set({ holdingsSortOption: option }),

      addInvestmentWithTypeAndOwner: (accountType: string, accountOwner: string) => {
        const { investments } = get();
        const newId = crypto.randomUUID();
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

      setExpandedFormId: (id) => {
        set({ expandedFormId: id });
      },

      reorderInvestments: (reorderedInvestments) => {
        set({ investments: reorderedInvestments });
      },

      resetStore: () => {
        set({
          investments: [],
          expandedFormId: "",
          holdingsSortOption: "default",
        });
      },
    }),
    {
      name: "investment-storage", // 저장 backend key (local 모드면 localStorage, cloud 모드면 /api/storage)
      storage: createJSONStorage(() => createHybridStorage("investment-storage")),
      version: 4,
      partialize: (state) => ({
        investments: state.investments,
        holdingsSortOption: state.holdingsSortOption,
        // expandedFormId 는 UI 상태라 저장 안 함
      }),
      // v0~v3 에서 v4 로의 정규화 마이그레이션은 `lib/local-id-upgrade.ts` 가
      // hybrid-storage 보다 먼저 실행되어 localStorage envelope 을 재작성한다.
      // 여기선 하이드레이션 실패를 막는 안전망만 둔다.
      migrate: (persisted, version) => {
        const state = persisted as { investments?: InvestmentItem[] } & Record<string, unknown>;
        if (!state.investments) state.investments = [];
        // v4 이전 envelope 은 bootstrap 단계에서 이미 업그레이드 됐어야 함.
        // 혹시라도 누락된 경우를 대비해 방어적으로 ID 가 없는 항목에 UUID 를 부여.
        if (version < 4) {
          state.investments = state.investments.map((inv) => ({
            ...inv,
            id: typeof inv.id === "string" && inv.id ? inv.id : crypto.randomUUID(),
            holdings: (inv.holdings ?? []).map((h) => ({
              ...h,
              id: typeof h.id === "string" && h.id ? h.id : crypto.randomUUID(),
            })),
            cashItems: (inv.cashItems ?? []).map((c) => ({
              ...c,
              id: typeof c.id === "string" && c.id ? c.id : crypto.randomUUID(),
            })),
          }));
          // 레거시 필드 제거
          delete (state as { lastInvestmentId?: unknown }).lastInvestmentId;
        }
        return state;
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
