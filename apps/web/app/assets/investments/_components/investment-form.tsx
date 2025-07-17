"use client";

import { useState } from "react";
import { AssetNameInput } from "@web/components/ui/asset-name-input";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import {
  ACCOUNT_TYPES,
  CurrencyType,
  DEFAULT_OWNERS,
} from "@web/features/investments/types/constants";
import { InvestmentItem } from "@web/features/investments/types/types";
import { numberToKorean, parseNumericString } from "@web/utils/number-format";
import { Trash } from "lucide-react";

interface InvestmentFormProps {
  handleSubmit: (e: React.FormEvent) => void;
}

export function InvestmentForm({ handleSubmit }: InvestmentFormProps) {
  // Zustand store에서 상태와 액션 가져오기
  const investments = useInvestmentStore((state) => state.investments);
  const customOwners = useInvestmentStore((state) => state.customOwners);
  const removeInvestment = useInvestmentStore((state) => state.removeInvestment);
  const updateInvestment = useInvestmentStore((state) => state.updateInvestment);
  const addCustomOwner = useInvestmentStore((state) => state.addCustomOwner);

  // 사용자 정의 소유자 추가 기능
  const [newCustomOwner, setNewCustomOwner] = useState("");
  const [showCustomOwnerInput, setShowCustomOwnerInput] = useState(false);

  // 필드 값 변경 함수
  const handleChange = (id: number, field: string, value: string) => {
    // 숫자 필드 처리 (currentValue 또는 initialInvestment 필드의 경우)
    if ((field === "currentValue" || field === "initialInvestment") && value) {
      try {
        // 콤마 제거 후 숫자로 변환
        const numericValue = parseNumericString(value);
        // 숫자가 아니면 처리하지 않음
        if (isNaN(numericValue)) return;

        // 숫자 값을 직접 업데이트
        updateInvestment(id, field as keyof InvestmentItem, numericValue);
        return;
      } catch (e) {
        // 숫자 변환 오류 시 그대로 사용
        console.error("Failed to format number", e);
      }
    }

    updateInvestment(id, field as keyof InvestmentItem, value);
  };

  // 사용자 정의 소유자 추가
  const handleAddCustomOwner = () => {
    if (newCustomOwner.trim() !== "" && !customOwners.includes(newCustomOwner.trim())) {
      addCustomOwner(newCustomOwner.trim());
      setNewCustomOwner("");
      setShowCustomOwnerInput(false);
    }
  };

  // 계좌 삭제 함수
  const removeInvestmentItem = (id: number) => {
    removeInvestment(id);
  };

  // 계좌 소유자 옵션 (기본 + 사용자 추가)
  const accountOwners = [...DEFAULT_OWNERS, ...customOwners];

  // 총 투자 금액 계산
  const totalInvestmentValue = investments.reduce((sum, item) => sum + (item.currentValue || 0), 0);

  return (
    <>
      {/* Custom Owner Input Modal */}
      {showCustomOwnerInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">새 소유자 추가</h3>
            <div className="mb-4">
              <Label htmlFor="new-owner" className="mb-2">
                소유자 이름
              </Label>
              <Input
                id="new-owner"
                type="text"
                value={newCustomOwner}
                onChange={(e) => setNewCustomOwner(e.target.value)}
                placeholder="소유자 이름 입력"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCustomOwnerInput(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAddCustomOwner}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 총액 표시 헤더 */}
        <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                총 투자 자산
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {investments.length}개 계좌
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {totalInvestmentValue > 0 ? numberToKorean(totalInvestmentValue.toString()) : "0원"}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">평가 금액</div>
            </div>
          </div>
        </div>

        {investments.map((item) => {
          return (
            <div
              key={item.id}
              className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <div className="p-6">
                <div className="space-y-6">
                  {/* 계좌 이름 + 계좌 유형 (한 줄로 묶음) */}
                  <div className="flex items-end gap-4">
                    {/* 계좌 유형 */}
                    <div className="w-36">
                      <Label
                        htmlFor={`account-type-${item.id}`}
                        className="text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        계좌 유형
                      </Label>
                      <div className="relative mt-1">
                        <Select
                          value={item.accountType}
                          onValueChange={(value) => handleChange(item.id, "accountType", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="유형 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {ACCOUNT_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <AssetNameInput
                      id={item.id}
                      label="계좌 이름"
                      value={item.accountName}
                      onChange={(value) => handleChange(item.id, "accountName", value)}
                      placeholder="계좌 이름을 입력하세요"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                    {/* 계좌 소유자 (작게) */}
                    {/* 현재 평가 금액 (강조) */}
                    <div>
                      <Label
                        htmlFor={`current-value-${item.id}`}
                        className="text-lg font-semibold text-gray-900 dark:text-white"
                      >
                        현재 평가 금액 ({item.currency === CurrencyType.KRW ? "만원" : "달러"})
                      </Label>
                      <div className="relative mt-2">
                        <div className="flex items-center">
                          <div className="flex-1">
                            <Input
                              id={`current-value-${item.id}`}
                              type="text"
                              value={
                                item.currentValue > 0 ? item.currentValue.toLocaleString() : ""
                              }
                              onChange={(e) =>
                                handleChange(item.id, "currentValue", e.target.value)
                              }
                              placeholder={`${item.currency === CurrencyType.KRW ? "만원" : "달러"} 단위로 입력`}
                              className="text-xl font-bold text-blue-600 dark:text-blue-400 border-2 border-blue-200 dark:border-blue-800 focus:border-blue-500 dark:focus:border-blue-400"
                            />
                            {item.currentValue > 0 && (
                              <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                {numberToKorean(item.currentValue.toString())}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="w-20">
                      <Label
                        htmlFor={`account-owner-${item.id}`}
                        className="text-xs font-medium text-gray-600 dark:text-gray-400"
                      >
                        소유자
                      </Label>
                      <div className="relative mt-1">
                        <Select
                          value={item.accountOwner}
                          onValueChange={(value) => handleChange(item.id, "accountOwner", value)}
                        >
                          <SelectTrigger className="w-full h-8 text-sm">
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {accountOwners.map((owner) => (
                                <SelectItem key={owner} value={owner}>
                                  {owner}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            저장하기
          </button>
        </div>
      </form>
    </>
  );
}
