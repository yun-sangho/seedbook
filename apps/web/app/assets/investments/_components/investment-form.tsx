"use client";

import { useState } from "react";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { DEFAULT_OWNERS } from "@web/features/investments/types/constants";
import { InvestmentItem, InvestmentRecord } from "@web/features/investments/types/types";
import { InvestmentItemComponent } from "./investment-item";

interface InvestmentFormProps {
  handleSubmit: (e: React.FormEvent) => void;
}

export function InvestmentForm({ handleSubmit }: InvestmentFormProps) {
  // Zustand store에서 상태와 액션 가져오기
  const investments = useInvestmentStore((state) => state.investments);
  const customOwners = useInvestmentStore((state) => state.customOwners);
  const updateInvestment = useInvestmentStore((state) => state.updateInvestment);
  const addInvestmentRecord = useInvestmentStore((state) => state.addInvestmentRecord);
  const updateInvestmentRecord = useInvestmentStore((state) => state.updateInvestmentRecord);
  const removeInvestmentRecord = useInvestmentStore((state) => state.removeInvestmentRecord);
  const addCustomOwner = useInvestmentStore((state) => state.addCustomOwner);

  // 사용자 정의 소유자 추가 기능
  const [newCustomOwner, setNewCustomOwner] = useState("");
  const [showCustomOwnerInput, setShowCustomOwnerInput] = useState(false);

  // 필드 값 변경 함수 (계좌 기본 정보용)
  const handleChange = (id: number, field: string, value: string) => {
    updateInvestment(id, field as keyof InvestmentItem, value);
  };

  // 투자 기록 변경 함수
  const handleRecordChange = (
    id: number,
    recordIndex: number,
    field: keyof InvestmentRecord,
    value: string
  ) => {
    updateInvestmentRecord(id, recordIndex, field, value);
  };

  // 새 투자 기록 추가
  const handleAddRecord = (id: number) => {
    addInvestmentRecord(id);
  };

  // 투자 기록 삭제
  const handleRemoveRecord = (id: number, recordIndex: number) => {
    removeInvestmentRecord(id, recordIndex);
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
        {investments.map((item) => (
          <InvestmentItemComponent
            key={item.id}
            item={item}
            accountOwners={accountOwners}
            onUpdateItem={handleChange}
            onAddRecord={handleAddRecord}
            onUpdateRecord={handleRecordChange}
            onRemoveRecord={handleRemoveRecord}
          />
        ))}

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
