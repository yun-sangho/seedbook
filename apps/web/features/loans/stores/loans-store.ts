"use client";

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { DefaultOwnerType } from "../types/constants";
import { LoanItem } from "../types/types";

// 대출 스토어 상태 인터페이스
interface LoansState {
  loans: LoanItem[];
  customOwners: string[];
  expandedFormId: number;
  lastLoanId: number;
  // 액션
  addLoan: () => void;
  removeLoan: (id: number) => void;
  updateLoan: <K extends keyof LoanItem>(id: number, key: K, value: LoanItem[K]) => void;
  addCustomOwner: (owner: string) => void;
  setExpandedFormId: (id: number) => void;
}

// Zustand 스토어 생성
export const useLoansStore = create<LoansState>()(
  devtools(
    persist(
      (set) => ({
        loans: [
          {
            id: 1,
            loanName: "대출 #1",
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
        customOwners: [],
        expandedFormId: 1,
        lastLoanId: 1,

        // 새 대출 추가
        addLoan: () =>
          set((state) => {
            const newId = state.lastLoanId + 1;
            return {
              loans: [
                ...state.loans,
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
              lastLoanId: newId,
              expandedFormId: newId,
            };
          }),

        // 대출 제거
        removeLoan: (id) =>
          set((state) => ({
            loans: state.loans.filter((item) => item.id !== id),
            expandedFormId: state.expandedFormId === id ? -1 : state.expandedFormId,
          })),

        // 대출 필드 업데이트
        updateLoan: (id, key, value) =>
          set((state) => ({
            loans: state.loans.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
          })),

        // 사용자 정의 소유자 추가
        addCustomOwner: (owner) =>
          set((state) => ({
            customOwners: [...state.customOwners, owner],
          })),

        // 확장된 폼 ID 설정
        setExpandedFormId: (id) =>
          set({
            expandedFormId: id,
          }),
      }),
      {
        name: "loans-storage", // localStorage 키 이름
      }
    )
  )
);
