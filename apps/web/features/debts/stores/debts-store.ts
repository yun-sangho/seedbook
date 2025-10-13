"use client";

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { DefaultOwnerType } from "../types/constants";
import { DebtsItem } from "../types/types";

// 대출 스토어 상태 인터페이스
interface DebtsState {
  debts: DebtsItem[];
  expandedFormId: number;
  lastDebtId: number;
  // 액션
  addDebt: () => void;
  removeDebt: (id: number) => void;
  updateDebt: <K extends keyof DebtsItem>(id: number, key: K, value: DebtsItem[K]) => void;
  setExpandedFormId: (id: number) => void;
  reorderDebts: (reorderedDebts: DebtsItem[]) => void;
}

// Zustand 스토어 생성
export const useDebtsStore = create<DebtsState>()(
  devtools(
    persist(
      (set) => ({
        debts: [],
        expandedFormId: 1,
        lastDebtId: 1,

        // 새 대출 추가
        addDebt: () =>
          set((state) => {
            const newId = state.lastDebtId + 1;
            return {
              debts: [
                ...state.debts,
                {
                  id: newId,
                  loanName: `대출 #${newId}`,
                  loanType: "",
                  loanOwner: DefaultOwnerType.SELF,
                  lender: "",
                  amount: 0,
                  interestRate: 0,
                  maturityDate: "",
                  monthlyPayment: 0,
                  note: "",
                },
              ],
              lastDebtId: newId,
              expandedFormId: newId,
            };
          }),

        // 대출 제거
        removeDebt: (id: number) =>
          set((state) => ({
            debts: state.debts.filter((item) => item.id !== id),
            expandedFormId: state.expandedFormId === id ? -1 : state.expandedFormId,
          })),

        // 대출 필드 업데이트
        updateDebt: <K extends keyof DebtsItem>(id: number, key: K, value: DebtsItem[K]) =>
          set((state) => ({
            debts: state.debts.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
          })),

        // 확장된 폼 ID 설정
        setExpandedFormId: (id: number) =>
          set({
            expandedFormId: id,
          }),

        // 대출 순서 재정렬
        reorderDebts: (reorderedDebts: DebtsItem[]) =>
          set({
            debts: reorderedDebts,
          }),
      }),
      {
        name: "debts-storage", // localStorage 키 이름
      }
    )
  )
);
