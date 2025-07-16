"use client";

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { DefaultOwnerType } from "../types/constants";
import { RealAssetItem } from "../types/types";

// 실물자산 스토어 상태 인터페이스
interface RealAssetsState {
  realAssets: RealAssetItem[];
  customOwners: string[];
  expandedFormId: number;
  lastRealAssetId: number;
  // 액션
  addRealAsset: () => void;
  removeRealAsset: (id: number) => void;
  updateRealAsset: <K extends keyof RealAssetItem>(
    id: number,
    key: K,
    value: RealAssetItem[K]
  ) => void;
  addCustomOwner: (owner: string) => void;
  setExpandedFormId: (id: number) => void;
}

// Zustand 스토어 생성
export const useRealAssetsStore = create<RealAssetsState>()(
  devtools(
    persist(
      (set) => ({
        realAssets: [
          {
            id: 1,
            assetName: "실물자산 #1",
            assetType: "",
            assetOwner: DefaultOwnerType.SELF,
            currentValue: 0,
            purchaseValue: 0,
            purchaseDate: "",
            note: "",
          },
        ],
        customOwners: [],
        expandedFormId: 1,
        lastRealAssetId: 1,

        // 새 실물자산 추가
        addRealAsset: () =>
          set((state) => {
            const newId = state.lastRealAssetId + 1;
            return {
              realAssets: [
                ...state.realAssets,
                {
                  id: newId,
                  assetName: `실물자산 #${newId}`,
                  assetType: "",
                  assetOwner: DefaultOwnerType.SELF,
                  currentValue: 0,
                  purchaseValue: 0,
                  purchaseDate: "",
                  note: "",
                },
              ],
              lastRealAssetId: newId,
              expandedFormId: newId,
            };
          }),

        // 실물자산 제거
        removeRealAsset: (id) =>
          set((state) => ({
            realAssets: state.realAssets.filter((item) => item.id !== id),
            expandedFormId: state.expandedFormId === id ? -1 : state.expandedFormId,
          })),

        // 실물자산 필드 업데이트
        updateRealAsset: (id, key, value) =>
          set((state) => ({
            realAssets: state.realAssets.map((item) =>
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
        name: "real-assets-storage", // localStorage 키 이름
      }
    )
  )
);
