"use client";

import { useState } from "react";
import { AssetNameInput } from "@web/components/ui/asset-name-input";
import { AssetValueInput } from "@web/components/ui/asset-value-input";
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
import { ACCOUNT_TYPES, DEFAULT_OWNERS } from "@web/features/investments/types/constants";
import { InvestmentItem } from "@web/features/investments/types/types";
import { parseNumericString } from "@web/utils/number-format";

interface InvestmentFormProps {
  handleSubmit: (e: React.FormEvent) => void;
}

export function InvestmentForm({ handleSubmit }: InvestmentFormProps) {
  // Zustand store에서 상태와 액션 가져오기
  const investments = useInvestmentStore((state) => state.investments);
  const customOwners = useInvestmentStore((state) => state.customOwners);
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

  // 계좌 소유자 옵션 (기본 + 사용자 추가)
  const accountOwners = [...DEFAULT_OWNERS, ...customOwners];

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
        {investments.map((item) => {
          return (
            <div
              key={item.id}
              className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <div className="flex flex-col gap-4 p-6 flex-wrap">
                <div className="flex gap-2 flex-wrap justify-between">
                  <AssetNameInput
                    id={item.id}
                    value={item.accountName}
                    onChange={(value) => handleChange(item.id, "currentValue", value)}
                    className=""
                  />
                  <div className="flex gap-2 flex-wrap justify-between">
                    <div className="w-36">
                      <Label
                        htmlFor={`account-type-${item.id}`}
                        className="text-sm font-medium text-gray-700 dark:text-white"
                      >
                        계좌 유형
                      </Label>
                      <div className="mt-2">
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
                    <div className="w-36">
                      <Label
                        htmlFor={`account-owner-${item.id}`}
                        className="text-sm font-medium text-gray-600 dark:text-white"
                      >
                        소유자
                      </Label>
                      <div className="relative mt-2">
                        <Select
                          value={item.accountOwner}
                          onValueChange={(value) => handleChange(item.id, "accountOwner", value)}
                        >
                          <SelectTrigger className="w-full">
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
                <AssetValueInput
                  className="w-full"
                  id={item.id}
                  value={item.currentValue}
                  currency={item.currency}
                  onChange={(value) => handleChange(item.id, "currentValue", value)}
                />
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
