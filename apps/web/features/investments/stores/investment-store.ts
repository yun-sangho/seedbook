"use client";

import { parseNumericString } from "@web/utils/number-format";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CurrencyType, DefaultOwnerType } from "../types/constants";
import { InvestmentItem, InvestmentRecord } from "../types/types";

// 현재 날짜를 YYYY-MM-DD 형식으로 반환하는 헬퍼 함수
const getCurrentDate = (): string => {
  return new Date().toISOString().split("T")[0] || "";
};

// 투자 정보 상태 인터페이스
interface InvestmentState {
  // 데이터
  investments: InvestmentItem[];
  customOwners: string[];
  lastInvestmentId: number;

  // UI 상태 (LocalStorage에 저장하지 않음)
  expandedFormId: number;

  // 액션
  addInvestment: () => void;
  addInvestmentWithType: (accountType: string) => void;
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
  addCustomOwner: (owner: string) => void;
  setExpandedFormId: (id: number) => void;
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

      addInvestment: () => {
        const { lastInvestmentId, investments } = get();
        const newId = lastInvestmentId + 1;

        set({
          investments: [
            {
              id: newId,
              accountName: `투자 계좌 #${newId}`,
              accountType: "",
              accountOwner: DefaultOwnerType.SELF,
              currency: CurrencyType.KRW,
              records: [
                {
                  date: getCurrentDate(),
                  initialInvestment: 0,
                  currentValue: 0,
                },
              ],
              note: "",
            },
            ...investments,
          ],
          lastInvestmentId: newId,
          expandedFormId: newId, // 새로 추가된 폼을 자동으로 펼침
        });
      },

      addInvestmentWithType: (accountType: string) => {
        const { lastInvestmentId, investments } = get();
        const newId = lastInvestmentId + 1;

        set({
          investments: [
            {
              id: newId,
              accountName: accountType || `투자 계좌 #${newId}`,
              accountType: accountType,
              accountOwner: DefaultOwnerType.SELF,
              currency: CurrencyType.KRW,
              records: [
                {
                  date: getCurrentDate(),
                  initialInvestment: 0,
                  currentValue: 0,
                },
              ],
              note: "",
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

            const processedValue = value;

            // records 필드가 아닌 경우만 직접 업데이트
            if (field !== "records") {
              const updatedItem = { ...item, [field]: processedValue };
              return updatedItem;
            }

            return item;
          });

          return {
            // 현재 펼쳐진 폼 ID가 현재 수정 중인 ID와 다르면 펼쳐진 폼 ID를 업데이트
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

      addCustomOwner: (owner) => {
        // 이미 있는 소유자면 추가하지 않음
        if (get().customOwners.includes(owner)) return;

        set((state) => ({
          customOwners: [...state.customOwners, owner],
        }));
      },

      setExpandedFormId: (id) => {
        set({ expandedFormId: id });
      },

      resetStore: () => {
        set({
          investments: [],
          customOwners: [],
          lastInvestmentId: 1,
          expandedFormId: 1,
        });
      },
    }),
    {
      name: "investment-storage", // localStorage에 저장될 키 이름
      storage: createJSONStorage(() => localStorage),
      // UI 관련 상태는 지속성 저장에서 제외 (성능 최적화)
      partialize: (state) => ({
        investments: state.investments,
        customOwners: state.customOwners,
        lastInvestmentId: state.lastInvestmentId,
        // expandedFormId는 제외
      }),
    }
  )
);
