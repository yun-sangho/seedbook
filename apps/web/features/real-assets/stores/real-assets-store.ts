"use client";

import { createHybridStorage } from "@web/lib/hybrid-storage";
import { getNextColor as getNextColorUtil } from "@web/utils/color-selection";
import { parseNumericString } from "@web/utils/number-format";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ASSET_COLORS, COLOR_FAMILIES, DefaultOwnerType, RealAssetType } from "../types/constants";
import { RealAssetItem } from "../types/types";

// 사용 가능한 색상을 반환하는 헬퍼 함수
const getNextColor = (existingAssets: RealAssetItem[]): string => {
  const usedColors = existingAssets.map((asset) => asset.color).filter(Boolean);
  return getNextColorUtil(usedColors, ASSET_COLORS, COLOR_FAMILIES);
};

// 실물자산 정보 상태 인터페이스
interface RealAssetsState {
  // 데이터
  realAssets: RealAssetItem[];
  lastRealAssetId: number;
  customOwners: string[];

  // UI 상태 (LocalStorage에 저장하지 않음)
  expandedFormId: number;

  // 액션
  addRealAsset: () => void;
  removeRealAsset: (id: number) => void;
  updateRealAsset: (id: number, field: keyof RealAssetItem, value: string | number) => void;
  setExpandedFormId: (id: number) => void;
  reorderRealAssets: (reorderedAssets: RealAssetItem[]) => void;
  resetStore: () => void;
}

// 관계형 DB 구조와 호환되도록 정규화된 형태로 저장하기 위한 상태
export const useRealAssetsStore = create<RealAssetsState>()(
  persist(
    (set, get) => ({
      realAssets: [],
      lastRealAssetId: 1,
      customOwners: [],
      expandedFormId: 1,

      addRealAsset: () => {
        const { lastRealAssetId, realAssets } = get();
        const newId = lastRealAssetId + 1;
        const newColor = getNextColor(realAssets);

        set({
          realAssets: [
            {
              id: newId,
              assetName: `실물자산 #${newId}`,
              assetType: RealAssetType.REAL_ESTATE,
              assetOwner: DefaultOwnerType.SELF,
              currentValue: 0,
              purchaseValue: 0,
              purchaseDate: "",
              note: "",
              color: newColor,
            },
            ...realAssets,
          ],
          lastRealAssetId: newId,
          expandedFormId: newId, // 새로 추가된 폼을 자동으로 펼침
        });
      },

      removeRealAsset: (id) => {
        set((state) => ({
          realAssets: state.realAssets.filter((item) => item.id !== id),
        }));
      },

      updateRealAsset: (id, field, value) => {
        set((state) => {
          const updatedRealAssets = state.realAssets.map((item) => {
            if (item.id !== id) return item;

            let processedValue = value;

            // Convert string values to numbers for numeric fields
            if (
              (field === "currentValue" || field === "purchaseValue") &&
              typeof value === "string"
            ) {
              processedValue = value ? parseNumericString(value) : 0;
            }

            const updatedItem = { ...item, [field]: processedValue };

            return updatedItem;
          });

          return {
            // 현재 펼쳐진 폼 ID가 현재 수정 중인 ID와 다르면 펼쳐진 폼 ID를 업데이트
            expandedFormId: state.expandedFormId !== id ? id : state.expandedFormId,
            realAssets: updatedRealAssets,
          };
        });
      },

      setExpandedFormId: (id) => {
        set({ expandedFormId: id });
      },

      reorderRealAssets: (reorderedAssets) => {
        set({ realAssets: reorderedAssets });
      },

      resetStore: () => {
        set({
          realAssets: [],
          lastRealAssetId: 1,
          customOwners: [],
          expandedFormId: 1,
        });
      },
    }),
    {
      name: "real-assets-storage", // 저장 backend key (local 모드면 localStorage, cloud 모드면 /api/storage)
      storage: createJSONStorage(() => createHybridStorage("real-assets-storage")),
      version: 1,
      // UI 관련 상태는 지속성 저장에서 제외 (성능 최적화)
      partialize: (state) => ({
        realAssets: state.realAssets,
        lastRealAssetId: state.lastRealAssetId,
        customOwners: state.customOwners,
        // expandedFormId는 제외
      }),
      // 만원 → 원 마이그레이션
      migrate: (persisted, version) => {
        if (version === 0) {
          const state = persisted as {
            realAssets: RealAssetItem[];
            lastRealAssetId: number;
            customOwners: string[];
          };
          const MANWON_TO_WON = 10000;
          state.realAssets = state.realAssets.map((a) => ({
            ...a,
            currentValue: a.currentValue * MANWON_TO_WON,
            purchaseValue: a.purchaseValue * MANWON_TO_WON,
          }));
        }
        return persisted as {
          realAssets: RealAssetItem[];
          lastRealAssetId: number;
          customOwners: string[];
        };
      },
      // 기존 데이터 마이그레이션: color 속성이 없는 자산에 색상 추가
      onRehydrateStorage: () => (state) => {
        if (state) {
          let needsUpdate = false;
          const updatedAssets = state.realAssets.map((asset, index) => {
            // color 속성이 없는 경우 추가
            if (!asset.color) {
              needsUpdate = true;
              return {
                ...asset,
                color: ASSET_COLORS[index % ASSET_COLORS.length] || "#3b82f6",
              };
            }
            return asset;
          });

          if (needsUpdate) {
            state.realAssets = updatedAssets;
          }
        }
      },
    }
  )
);
