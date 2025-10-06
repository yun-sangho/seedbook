import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AssetProgressPoint } from "../types/progress";

interface ProgressState {
  progressPoints: AssetProgressPoint[];
  addProgressPoint: (point: AssetProgressPoint) => void;
  updateProgressPoint: (date: string, point: Partial<AssetProgressPoint>) => void;
  deleteProgressPoint: (date: string) => void;
  setProgressPoints: (points: AssetProgressPoint[]) => void;
  clearProgressPoints: () => void;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      progressPoints: [],

      addProgressPoint: (point) =>
        set((state) => {
          // 같은 날짜가 있으면 병합, 없으면 추가
          const existingIndex = state.progressPoints.findIndex((p) => p.date === point.date);

          if (existingIndex >= 0) {
            // 기존 포인트와 병합
            const updated = [...state.progressPoints];
            updated[existingIndex] = {
              date: point.date,
              totalAssets: point.totalAssets,
              netAssets: point.netAssets,
              investments: point.investments,
              savings: point.savings,
              realAssets: point.realAssets,
              loans: point.loans,
            };
            return { progressPoints: updated };
          } else {
            // 새 포인트 추가 후 날짜순 정렬
            const updated = [...state.progressPoints, point].sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            );
            return { progressPoints: updated };
          }
        }),

      updateProgressPoint: (date, point) =>
        set((state) => {
          const index = state.progressPoints.findIndex((p) => p.date === date);
          if (index >= 0) {
            const updated = [...state.progressPoints];
            updated[index] = { ...updated[index], ...point } as AssetProgressPoint;
            return { progressPoints: updated };
          }
          return state;
        }),

      deleteProgressPoint: (date) =>
        set((state) => ({
          progressPoints: state.progressPoints.filter((p) => p.date !== date),
        })),

      setProgressPoints: (points) =>
        set({
          progressPoints: points.sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          ),
        }),

      clearProgressPoints: () => set({ progressPoints: [] }),
    }),
    {
      name: "progress-storage",
    }
  )
);
