"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@web/components/ui/dialog";
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
import { Textarea } from "@web/components/ui/textarea";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import {
  DEFAULT_OWNERS,
  DefaultOwnerType,
  SAVINGS_TYPES,
} from "@web/features/savings/types/constants";
import { SavingsItem } from "@web/features/savings/types/types";
import { parseNumericString } from "@web/utils/number-format";

interface AddSavingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddSavingsModal({ isOpen, onClose }: AddSavingsModalProps) {
  const [formData, setFormData] = useState<Omit<SavingsItem, "id">>({
    accountName: "",
    accountType: "",
    accountOwner: DefaultOwnerType.SELF,
    amount: 0,
    note: "",
  });

  // 커스텀 소유자 관련
  const customOwners = useSavingsStore((state) => state.customOwners);
  const addCustomOwner = useSavingsStore((state) => state.addCustomOwner);
  const [showCustomOwnerInput, setShowCustomOwnerInput] = useState(false);
  const [newCustomOwner, setNewCustomOwner] = useState("");

  // Zustand store에서 계좌 추가 함수 가져오기
  const addSavings = useSavingsStore((state) => state.addSavings);
  const updateSavings = useSavingsStore((state) => state.updateSavings);
  const lastSavingsId = useSavingsStore((state) => state.lastSavingsId);

  // 필드 값 변경 함수
  const handleChange = (field: keyof Omit<SavingsItem, "id">, value: string | number) => {
    // 숫자 필드 처리
    if (field === "amount" && typeof value === "string") {
      try {
        // 콤마 제거 후 숫자로 변환
        const numericValue = value ? parseNumericString(value) : 0;
        setFormData({ ...formData, [field]: numericValue });
        return;
      } catch (e) {
        console.error("Failed to format number", e);
      }
    }

    setFormData({ ...formData, [field]: value });
  };

  // 사용자 정의 소유자 추가
  const handleAddCustomOwner = () => {
    if (newCustomOwner.trim() !== "" && !customOwners.includes(newCustomOwner.trim())) {
      addCustomOwner(newCustomOwner.trim());
      setFormData({ ...formData, accountOwner: newCustomOwner.trim() });
      setNewCustomOwner("");
      setShowCustomOwnerInput(false);
    }
  };

  // 계좌 추가 제출 처리
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 새 계좌 추가
    addSavings();

    // 마지막에 추가된 계좌 ID를 가져와서 업데이트
    const newId = lastSavingsId + 1;

    // 계좌 이름이 비어있으면 기본 이름 사용
    const accountName = formData.accountName || `저축 계좌 #${newId}`;

    // 각 필드 업데이트
    updateSavings(newId, "accountName", accountName);
    updateSavings(newId, "accountType", formData.accountType);
    updateSavings(newId, "accountOwner", formData.accountOwner);
    updateSavings(newId, "amount", formData.amount);
    updateSavings(newId, "note", formData.note);

    // 폼 초기화 및 모달 닫기
    setFormData({
      accountName: "",
      accountType: "",
      accountOwner: DefaultOwnerType.SELF,
      amount: 0,
      note: "",
    });

    onClose();
  };

  // 계좌 소유자 옵션 (기본 + 사용자 추가)
  const accountOwners = [...DEFAULT_OWNERS, ...customOwners];

  return (
    <>
      {/* Custom Owner Input Modal */}
      {showCustomOwnerInput && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">새 소유자 추가</h3>
            <div className="mb-4">
              <Label htmlFor="custom-owner" className="mb-2 block">
                소유자 이름
              </Label>
              <Input
                id="custom-owner"
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

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>새 저축 계좌 추가</DialogTitle>
            <DialogDescription>
              새로운 저축 계좌의 정보를 입력해주세요. 기본 정보와 금액을 입력하면 계좌가 추가됩니다.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {/* 계좌명 */}
              <div>
                <Label htmlFor="account-name">계좌명</Label>
                <Input
                  id="account-name"
                  type="text"
                  value={formData.accountName}
                  onChange={(e) => handleChange("accountName", e.target.value)}
                  placeholder="계좌명 입력"
                  className="mt-2"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 저축 유형 */}
                <div>
                  <Label htmlFor="account-type">저축 유형</Label>
                  <Select
                    value={formData.accountType}
                    onValueChange={(value) => handleChange("accountType", value)}
                  >
                    <SelectTrigger className="w-full mt-2">
                      <SelectValue placeholder="유형 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {SAVINGS_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {/* 계좌 소유자 */}
                <div>
                  <Label htmlFor="account-owner">계좌 소유자</Label>
                  <Select
                    value={formData.accountOwner}
                    onValueChange={(value) => {
                      if (value === "custom") {
                        setShowCustomOwnerInput(true);
                      } else {
                        handleChange("accountOwner", value);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full mt-2">
                      <SelectValue placeholder="소유자 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {accountOwners.map((owner) => (
                          <SelectItem key={owner} value={owner}>
                            {owner}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">+ 새 소유자 추가</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {/* 금액 */}
                <div>
                  <Label htmlFor="amount">금액 (만원)</Label>
                  <Input
                    id="amount"
                    type="text"
                    value={formData.amount > 0 ? formData.amount.toLocaleString() : ""}
                    onChange={(e) => handleChange("amount", e.target.value)}
                    placeholder="만원 단위로 입력"
                    className="mt-2"
                  />
                </div>

                {/* 메모 */}
                <div className="md:col-span-2">
                  <Label htmlFor="note">메모</Label>
                  <Textarea
                    id="note"
                    value={formData.note}
                    onChange={(e) => handleChange("note", e.target.value)}
                    placeholder="메모 작성"
                    rows={3}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                계좌 추가
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
