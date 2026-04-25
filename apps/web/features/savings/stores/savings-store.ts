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

  // UI 상태 (저장 안됨). 빈 문자열이면 "펼친 폼 없음".
  expandedFormId: string;

  // 계좌 관리 액션
  addSavingsWithType: (type: string) => void;
  removeSavings: (id: string) => void;
  updateSavings: <K extends keyof SavingsItem>(id: string, field: K, value: SavingsItem[K]) => void;
  reorderSavings: (reorderedSavings: SavingsItem[]) => void;

  // 히스토리 관리 액션
  addHistoryRecord: (id: string, date: string, balance: number) => void;
  removeSavingsHistoryRecord: (id: string, date: string) => void;

  // UI 상태
  setExpandedFormId: (id: string) => void;

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
const initialState: Pick<SavingsState, "savings" | "expandedFormId"> = {
  savings: [],
  expandedFormId: "",
};

/**
 * Zustand 저축 스토어
 */
export const useSavingsStore = create<SavingsState>()(
  persist(
    (set) => ({
      ...initialState,

      // 유형 지정 계좌 추가
      addSavingsWithType: (type: string) =>
        set((state) => {
          const newId = crypto.randomUUID();
          const newColor = getNextColor(state.savings);

          return {
            savings: [
              ...state.savings,
              {
                id: newId,
                accountName: `${type} 계좌 ${state.savings.length + 1}`,
                accountType: type,
                currency: "원",
                balance: 0,
                records: [],
                note: "",
                color: newColor,
              },
            ],
            expandedFormId: newId,
          };
        }),

      // 계좌 삭제
      removeSavings: (id: string) =>
        set((state) => ({
          savings: state.savings.filter((item) => item.id !== id),
          expandedFormId: state.expandedFormId === id ? "" : state.expandedFormId,
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
      version: 3,
      partialize: (state) => ({
        savings: state.savings,
        // expandedFormId 는 UI 상태이므로 제외
      }),
      // v0~v1 → v2 정규화 마이그레이션은 `lib/local-id-upgrade.ts` 가 선행
      // 실행되어 localStorage envelope 을 새 shape 으로 재작성한다. 여기선
      // 누락된 ID 에 대한 방어망만 둔다.
      migrate: (persisted, version) => {
        const state = persisted as { savings?: SavingsItem[] } & Record<string, unknown>;
        if (!state.savings) state.savings = [];
        if (version < 2) {
          state.savings = state.savings.map((s) => ({
            ...s,
            id: typeof s.id === "string" && s.id ? s.id : crypto.randomUUID(),
          }));
          delete (state as { lastSavingsId?: unknown }).lastSavingsId;
        }
        if (version < 3) {
          state.savings = state.savings.map((s) => {
            const next = { ...s } as SavingsItem & { accountOwner?: unknown };
            delete next.accountOwner;
            return next;
          });
        }
        return state;
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
