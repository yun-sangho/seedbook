"use client";

import { createHybridStorage } from "@web/lib/hybrid-storage";
import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { DefaultOwnerType } from "../types/constants";
import { DebtsItem } from "../types/types";

// 대출 스토어 상태 인터페이스
interface DebtsState {
  debts: DebtsItem[];
  expandedFormId: string; // "" 이면 펼친 폼 없음
  // 액션
  addDebt: (initial?: { loanType?: string; loanOwner?: string }) => void;
  removeDebt: (id: string) => void;
  updateDebt: <K extends keyof DebtsItem>(id: string, key: K, value: DebtsItem[K]) => void;
  setExpandedFormId: (id: string) => void;
  reorderDebts: (reorderedDebts: DebtsItem[]) => void;
}

// Zustand 스토어 생성
export const useDebtsStore = create<DebtsState>()(
  devtools(
    persist(
      (set) => ({
        debts: [],
        expandedFormId: "",

        // 새 대출 추가. `loanType` / `loanOwner` 를 전달하면 같은 UUID 에
        // 대해 loanName 까지 바로 세팅한다 (모달에서 사용).
        addDebt: (initial) =>
          set((state) => {
            const newId = crypto.randomUUID();
            const loanType = initial?.loanType ?? "";
            const loanOwner = initial?.loanOwner ?? DefaultOwnerType.SELF;
            const loanName =
              loanType && initial?.loanOwner
                ? `${loanOwner}의 ${loanType}`
                : `대출 #${state.debts.length + 1}`;
            return {
              debts: [
                ...state.debts,
                {
                  id: newId,
                  loanName,
                  loanType,
                  loanOwner,
                  lender: "",
                  amount: 0,
                  interestRate: 0,
                  maturityDate: "",
                  monthlyPayment: 0,
                  note: "",
                },
              ],
              expandedFormId: newId,
            };
          }),

        // 대출 제거
        removeDebt: (id: string) =>
          set((state) => ({
            debts: state.debts.filter((item) => item.id !== id),
            expandedFormId: state.expandedFormId === id ? "" : state.expandedFormId,
          })),

        // 대출 필드 업데이트
        updateDebt: <K extends keyof DebtsItem>(id: string, key: K, value: DebtsItem[K]) =>
          set((state) => ({
            debts: state.debts.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
          })),

        // 확장된 폼 ID 설정
        setExpandedFormId: (id: string) =>
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
        name: "debts-storage", // 저장 backend key (local 모드면 localStorage, cloud 모드면 /api/storage)
        storage: createJSONStorage(() => createHybridStorage("debts-storage")),
        version: 2,
        // v0~v1 → v2 정규화: `lib/local-id-upgrade.ts` 에서 선행 처리.
        migrate: (persisted, version) => {
          const state = persisted as { debts?: DebtsItem[] } & Record<string, unknown>;
          if (!state.debts) state.debts = [];
          if (version < 2) {
            state.debts = state.debts.map((d) => ({
              ...d,
              id: typeof d.id === "string" && d.id ? d.id : crypto.randomUUID(),
            }));
            delete (state as { lastDebtId?: unknown }).lastDebtId;
          }
          return state;
        },
      }
    )
  )
);
