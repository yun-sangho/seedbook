"use client";

import { createHybridStorage } from "@web/lib/hybrid-storage";
import { getNextColor as getNextColorUtil } from "@web/utils/color-selection";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ACCOUNT_COLORS, COLOR_FAMILIES } from "../types/constants";
import type { SavingsItem, SavingsRecord } from "../types/types";

/**
 * 저축 스토어 상태 인터페이스
 */
interface SavingsState {
  // 데이터 (localStorage에 저장)
  savings: SavingsItem[];
  lastSavingsId: number;

  // UI 상태 (저장 안됨)
  expandedFormId: number;

  // 계좌 관리 액션
  addSavingsWithTypeAndOwner: (type: string, owner: string) => void;
  removeSavings: (id: number) => void;
  updateSavings: <K extends keyof SavingsItem>(id: number, field: K, value: SavingsItem[K]) => void;
  reorderSavings: (reorderedSavings: SavingsItem[]) => void;

  // 히스토리 관리 액션
  addHistoryRecord: (id: number, date: string, balance: number) => void;
  removeSavingsHistoryRecord: (id: number, date: string) => void;

  // UI 상태
  setExpandedFormId: (id: number) => void;

  // 스토어 초기화
  resetStore: () => void;
}

/**
 * 다음 사용 가능한 색상 선택 헬퍼 함수
 * 공통 color-selection 유틸을 사용
 */
const getNextColor = (existingSavings: SavingsItem[]): string => {
  const usedColors = existingSavings.map((s) => s.color).filter(Boolean);
  return getNextColorUtil(usedColors, ACCOUNT_COLORS, COLOR_FAMILIES);
};

/**
 * 초기 상태
 */
const initialState = {
  savings: [],
  customOwners: [],
  lastSavingsId: 1,
  expandedFormId: 1,
};

/**
 * Zustand 저축 스토어
 */
export const useSavingsStore = create<SavingsState>()(
  persist(
    (set) => ({
      ...initialState,

      // 유형+소유자 지정 계좌 추가
      addSavingsWithTypeAndOwner: (type: string, owner: string) =>
        set((state) => {
          const newId = state.lastSavingsId + 1;
          const newColor = getNextColor(state.savings);

          return {
            savings: [
              ...state.savings,
              {
                id: newId,
                accountName: `${owner}의 ${type} 계좌`,
                accountType: type,
                accountOwner: owner,
                currency: "원",
                balance: 0,
                records: [],
                note: "",
                color: newColor,
              },
            ],
            lastSavingsId: newId,
            expandedFormId: newId,
          };
        }),

      // 계좌 삭제
      removeSavings: (id: number) =>
        set((state) => ({
          savings: state.savings.filter((item) => item.id !== id),
          expandedFormId: state.expandedFormId === id ? -1 : state.expandedFormId,
        })),

      // 계좌 정보 업데이트
      updateSavings: (id, field, value) =>
        set((state) => ({
          savings: state.savings.map((item) => {
            if (item.id !== id) return item;

            // 숫자 필드 처리
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let processedValue: any = value;
            if (field === "balance" || field === "interestRate") {
              if (typeof value === "string") {
                // 콤마 제거 후 숫자로 변환
                const numericString = value.replace(/,/g, "").trim();
                if (numericString === "") {
                  // 빈 문자열이면 field에 따라 처리
                  processedValue = field === "balance" ? 0 : undefined;
                } else {
                  processedValue = parseFloat(numericString);
                }
              }
            }

            const updatedItem = { ...item, [field]: processedValue };

            // 잔액이 변경되었을 때 자동으로 기록 추가
            if (field === "balance" && processedValue !== item.balance) {
              const currentDate = new Date().toISOString().split("T")[0]!;
              const newRecord: SavingsRecord = {
                date: currentDate,
                balance: processedValue as number,
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
                // 새 기록 추가
                updatedItem.records = [...item.records, newRecord];
              }

              // 날짜순 정렬 (최신순)
              updatedItem.records.sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
              );
            }

            return updatedItem;
          }),
        })),

      // 계좌 순서 변경
      reorderSavings: (reorderedSavings) =>
        set({
          savings: reorderedSavings,
        }),

      // 히스토리 기록 추가
      addHistoryRecord: (id, date, balance) =>
        set((state) => ({
          savings: state.savings.map((item) => {
            if (item.id !== id) return item;

            const existingRecords = item.records || [];
            const existingIndex = existingRecords.findIndex((r) => r.date === date);

            let updatedRecords: SavingsRecord[];
            if (existingIndex >= 0) {
              // 같은 날짜 기록이 있으면 덮어쓰기
              updatedRecords = [...existingRecords];
              updatedRecords[existingIndex] = {
                date,
                balance,
              };
            } else {
              // 새 기록 추가
              updatedRecords = [
                ...existingRecords,
                {
                  date,
                  balance,
                },
              ];
            }

            // 날짜순 정렬 (최신순)
            updatedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            return {
              ...item,
              records: updatedRecords,
            };
          }),
        })),

      // 히스토리 기록 삭제
      removeSavingsHistoryRecord: (id, date) =>
        set((state) => ({
          savings: state.savings.map((item) => {
            if (item.id !== id) return item;

            const updatedRecords = (item.records || []).filter((r) => r.date !== date);

            return {
              ...item,
              records: updatedRecords,
            };
          }),
        })),

      // 확장된 폼 ID 설정
      setExpandedFormId: (id) =>
        set({
          expandedFormId: id,
        }),

      // 스토어 초기화
      resetStore: () => set(initialState),
    }),
    {
      name: "savings-storage",
      storage: createJSONStorage(() => createHybridStorage("savings-storage")),
      version: 1,
      partialize: (state) => ({
        savings: state.savings,
        lastSavingsId: state.lastSavingsId,
        // expandedFormId는 UI 상태이므로 제외
      }),
      // 만원 → 원 마이그레이션
      migrate: (persisted, version) => {
        if (version === 0) {
          const state = persisted as { savings: SavingsItem[]; lastSavingsId: number };
          const MANWON_TO_WON = 10000;
          state.savings = state.savings.map((s) => ({
            ...s,
            balance: s.balance * MANWON_TO_WON,
            records: (s.records || []).map((r) => ({
              ...r,
              balance: r.balance * MANWON_TO_WON,
            })),
          }));
        }
        return persisted as { savings: SavingsItem[]; lastSavingsId: number };
      },
      onRehydrateStorage: () => (state) => {
        // localStorage에서 로드 후 color 속성 없으면 추가 (마이그레이션)
        if (state) {
          state.savings = state.savings.map((saving, index) => ({
            ...saving,
            color: saving.color || ACCOUNT_COLORS[index % ACCOUNT_COLORS.length]!,
            records: saving.records || [], // records 없으면 빈 배열
          }));
        }
      },
    }
  )
);
