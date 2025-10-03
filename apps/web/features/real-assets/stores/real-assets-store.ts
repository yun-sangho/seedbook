"use client";

import { parseNumericString } from "@web/utils/number-format";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DefaultOwnerType, RealAssetType } from "../types/constants";
import { RealAssetItem } from "../types/types";

// 초기 실물자산
const DEFAULT_REAL_ASSET: RealAssetItem = {
  id: 1,
  assetName: "실물자산 #1",
  assetType: RealAssetType.REAL_ESTATE,
  assetOwner: DefaultOwnerType.SELF,
  currentValue: 0,
  purchaseValue: 0,
  purchaseDate: "",
  note: "",
};

// 실물자산 정보 상태 인터페이스
interface RealAssetsState {
  // 데이터
  realAssets: RealAssetItem[];
  customOwners: string[];
  lastRealAssetId: number;

  // UI 상태 (LocalStorage에 저장하지 않음)
  expandedFormId: number;

  // 액션
  addRealAsset: () => void;
  removeRealAsset: (id: number) => void;
  updateRealAsset: (id: number, field: keyof RealAssetItem, value: string | number) => void;
  addCustomOwner: (owner: string) => void;
  setExpandedFormId: (id: number) => void;
  reorderRealAssets: (reorderedAssets: RealAssetItem[]) => void;
  resetStore: () => void;
}

// 관계형 DB 구조와 호환되도록 정규화된 형태로 저장하기 위한 상태
export const useRealAssetsStore = create<RealAssetsState>()(
  persist(
    (set, get) => ({
      realAssets: [],
      customOwners: [],
      lastRealAssetId: 1,
      expandedFormId: 1,

      addRealAsset: () => {
        const { lastRealAssetId, realAssets } = get();
        const newId = lastRealAssetId + 1;

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

      reorderRealAssets: (reorderedAssets) => {
        set({ realAssets: reorderedAssets });
      },

      resetStore: () => {
        set({
          realAssets: [DEFAULT_REAL_ASSET],
          customOwners: [],
          lastRealAssetId: 1,
          expandedFormId: 1,
        });
      },
    }),
    {
      name: "real-assets-storage", // localStorage에 저장될 키 이름
      storage: createJSONStorage(() => localStorage),
      // UI 관련 상태는 지속성 저장에서 제외 (성능 최적화)
      partialize: (state) => ({
        realAssets: state.realAssets,
        customOwners: state.customOwners,
        lastRealAssetId: state.lastRealAssetId,
        // expandedFormId는 제외
      }),
    }
  )
);
