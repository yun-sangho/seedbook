"use client";

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { SavingsItem } from "../types/types";

// 저축 스토어 상태 인터페이스
interface SavingsState {
  savings: SavingsItem[];
  customOwners: string[];
  expandedFormId: number;
  lastSavingsId: number;
  // 액션
  addSavings: () => void;
  removeSavings: (id: number) => void;
  updateSavings: <K extends keyof SavingsItem>(id: number, key: K, value: SavingsItem[K]) => void;
  addCustomOwner: (owner: string) => void;
  setExpandedFormId: (id: number) => void;
}

// Zustand 스토어 생성
export const useSavingsStore = create<SavingsState>()(
  devtools(
    persist(
      (set) => ({
        savings: [
          {
            id: 1,
            accountName: "저축 계좌 #1",
            accountType: "",
            accountOwner: "본인",
            amount: 0,
            note: "",
          },
        ],
        customOwners: [],
        expandedFormId: 1,
        lastSavingsId: 1,

        // 새 저축 계좌 추가
        addSavings: () =>
          set((state) => {
            const newId = state.lastSavingsId + 1;
            return {
              savings: [
                ...state.savings,
                {
                  id: newId,
                  accountName: `저축 계좌 #${newId}`,
                  accountType: "",
                  accountOwner: "본인",
                  amount: 0,
                  note: "",
                },
              ],
              lastSavingsId: newId,
              expandedFormId: newId,
            };
          }),

        // 저축 계좌 제거
        removeSavings: (id) =>
          set((state) => ({
            savings: state.savings.filter((item) => item.id !== id),
            expandedFormId: state.expandedFormId === id ? -1 : state.expandedFormId,
          })),

        // 저축 계좌 필드 업데이트
        updateSavings: (id, key, value) =>
          set((state) => ({
            savings: state.savings.map((item) =>
              item.id === id ? { ...item, [key]: value } : item
            ),
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
        name: "savings-storage", // localStorage 키 이름
      }
    )
  )
);
