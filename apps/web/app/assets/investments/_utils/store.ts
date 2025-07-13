"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CurrencyType, DefaultOwnerType, InvestmentItem } from "./constants";

// 초기 투자 계좌
const DEFAULT_INVESTMENT: InvestmentItem = {
  id: 1,
  accountName: "투자 계좌 #1",
  accountType: "",
  accountOwner: DefaultOwnerType.SELF,
  currency: CurrencyType.KRW,
  currentValue: "",
  note: "",
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
  removeInvestment: (id: number) => void;
  updateInvestment: (id: number, field: keyof InvestmentItem, value: string) => void;
  addCustomOwner: (owner: string) => void;
  setExpandedFormId: (id: number) => void;
  resetStore: () => void;
}

// 관계형 DB 구조와 호환되도록 정규화된 형태로 저장하기 위한 상태
export const useInvestmentStore = create<InvestmentState>()(
  persist(
    (set, get) => ({
      investments: [DEFAULT_INVESTMENT],
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
              currentValue: "",
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
        set((state) => ({
          // 현재 펼쳐진 폼 ID가 현재 수정 중인 ID와 다르면 펼쳐진 폼 ID를 업데이트
          expandedFormId: state.expandedFormId !== id ? id : state.expandedFormId,
          investments: state.investments.map((item) =>
            item.id === id ? { ...item, [field]: value } : item
          ),
        }));
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
          investments: [DEFAULT_INVESTMENT],
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
