"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { Textarea } from "@web/components/ui/textarea";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { DEFAULT_OWNERS, REAL_ASSET_TYPES } from "@web/features/real-assets/types/constants";
import { numberToKorean, parseNumericString } from "@web/utils/number-format";
import { ChevronLeft, Trash2 } from "lucide-react";

export default function RealAssetsPage() {
  // Zustand 스토어에서 상태와 액션 가져오기
  const realAssets = useRealAssetsStore((state) => state.realAssets);
  const addRealAsset = useRealAssetsStore((state) => state.addRealAsset);
  const removeRealAsset = useRealAssetsStore((state) => state.removeRealAsset);
  const updateRealAsset = useRealAssetsStore((state) => state.updateRealAsset);

  // 총 실물자산 금액 계산 - 최적화를 위해 useMemo 사용
  const totalRealAssetsValue = useMemo(() => {
    return realAssets.reduce((sum, item) => sum + item.currentValue, 0);
  }, [realAssets]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Zustand 스토어는 실시간으로 업데이트되므로 추가 저장 필요 없음
    console.log("실물자산 데이터가 저장되었습니다:", realAssets);
    // 자산 페이지로 이동
    window.location.href = "/assets";
  };

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <Link
            href="/assets"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            돌아가기
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-4">실물자산 정보 입력</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            부동산, 자동차, 귀금속 등의 실물자산 정보를 입력해주세요
          </p>
          <p className="text-blue-600 dark:text-blue-400">
            총 실물자산 가치: {numberToKorean(totalRealAssetsValue.toString())}원
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {realAssets.map((item) => (
            <div key={item.id} className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{item.assetName}</h3>
                {realAssets.length > 1 && (
                  <button
                    type="button"
                    className="p-2 text-red-500 hover:bg-gray-100 rounded-full dark:hover:bg-gray-700"
                    onClick={() => removeRealAsset(item.id)}
                    aria-label="삭제"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`type-${item.id}`}>자산 유형</Label>
                  <Select
                    value={item.assetType}
                    onValueChange={(value) => updateRealAsset(item.id, "assetType", value)}
                  >
                    <SelectTrigger id={`type-${item.id}`}>
                      <SelectValue placeholder="자산 유형 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {REAL_ASSET_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor={`name-${item.id}`}>자산명</Label>
                  <Input
                    id={`name-${item.id}`}
                    placeholder="자산명"
                    value={item.assetName}
                    onChange={(e) => updateRealAsset(item.id, "assetName", e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor={`owner-${item.id}`}>소유자</Label>
                  <Select
                    value={item.assetOwner}
                    onValueChange={(value) => updateRealAsset(item.id, "assetOwner", value)}
                  >
                    <SelectTrigger id={`owner-${item.id}`}>
                      <SelectValue placeholder="소유자 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEFAULT_OWNERS.map((owner) => (
                        <SelectItem key={owner} value={owner}>
                          {owner}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor={`purchaseValue-${item.id}`}>구입 금액 (원)</Label>
                  <Input
                    id={`purchaseValue-${item.id}`}
                    placeholder="구입 금액"
                    value={
                      item.purchaseValue === 0
                        ? ""
                        : item.purchaseValue
                          ? item.purchaseValue.toString()
                          : ""
                    }
                    onChange={(e) =>
                      updateRealAsset(item.id, "purchaseValue", parseNumericString(e.target.value))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor={`currentValue-${item.id}`}>현재 가치 (원)</Label>
                  <Input
                    id={`currentValue-${item.id}`}
                    placeholder="현재 가치"
                    value={
                      item.currentValue === 0
                        ? ""
                        : item.currentValue
                          ? item.currentValue.toString()
                          : ""
                    }
                    onChange={(e) =>
                      updateRealAsset(item.id, "currentValue", parseNumericString(e.target.value))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor={`purchaseDate-${item.id}`}>구입일</Label>
                  <Input
                    id={`purchaseDate-${item.id}`}
                    type="date"
                    value={item.purchaseDate}
                    onChange={(e) => updateRealAsset(item.id, "purchaseDate", e.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor={`note-${item.id}`}>메모</Label>
                  <Textarea
                    id={`note-${item.id}`}
                    placeholder="메모 추가"
                    value={item.note}
                    onChange={(e) => updateRealAsset(item.id, "note", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            className="flex items-center justify-center w-full p-3 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800/50"
            onClick={addRealAsset}
          >
            + 실물자산 추가
          </button>

          <div className="flex justify-end gap-4">
            <Link
              href="/assets"
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              취소
            </Link>
            <button
              type="submit"
              className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              저장하기
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
