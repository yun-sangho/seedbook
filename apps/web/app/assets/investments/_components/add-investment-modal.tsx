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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Textarea } from "@web/components/ui/textarea";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import {
  ACCOUNT_TYPES,
  CurrencyType,
  DEFAULT_OWNERS,
  DefaultOwnerType,
} from "@web/features/investments/types/constants";
import { InvestmentItem } from "@web/features/investments/types/types";
import { parseNumericString } from "@web/utils/number-format";

interface AddInvestmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddInvestmentModal({ isOpen, onClose }: AddInvestmentModalProps) {
  const [formData, setFormData] = useState<Omit<InvestmentItem, "id">>({
    accountName: "",
    accountType: "",
    accountOwner: DefaultOwnerType.SELF,
    currency: CurrencyType.KRW,
    currentValue: 0,
    initialInvestment: 0,
    note: "",
  });

  // 커스텀 소유자 관련
  const customOwners = useInvestmentStore((state) => state.customOwners);
  const addCustomOwner = useInvestmentStore((state) => state.addCustomOwner);
  const [showCustomOwnerInput, setShowCustomOwnerInput] = useState(false);
  const [newCustomOwner, setNewCustomOwner] = useState("");

  // Zustand store에서 계좌 추가 함수 가져오기
  const addInvestment = useInvestmentStore((state) => state.addInvestment);
  const updateInvestment = useInvestmentStore((state) => state.updateInvestment);
  const lastInvestmentId = useInvestmentStore((state) => state.lastInvestmentId);

  // 필드 값 변경 함수
  const handleChange = (field: keyof Omit<InvestmentItem, "id">, value: string | number) => {
    // 숫자 필드 처리 (currentValue 또는 initialInvestment 필드의 경우)
    if ((field === "currentValue" || field === "initialInvestment") && typeof value === "string") {
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
    addInvestment();

    // 마지막에 추가된 계좌 ID를 가져와서 업데이트
    const newId = lastInvestmentId + 1;

    // 계좌 이름이 비어있으면 기본 이름 사용
    const accountName = formData.accountName || `투자 계좌 #${newId}`;

    // 각 필드 업데이트
    updateInvestment(newId, "accountName", accountName);
    updateInvestment(newId, "accountType", formData.accountType);
    updateInvestment(newId, "accountOwner", formData.accountOwner);
    updateInvestment(newId, "currency", formData.currency);
    updateInvestment(newId, "currentValue", formData.currentValue);
    updateInvestment(newId, "initialInvestment", formData.initialInvestment || 0);
    updateInvestment(newId, "note", formData.note);

    // 폼 초기화 및 모달 닫기
    setFormData({
      accountName: "",
      accountType: "",
      accountOwner: DefaultOwnerType.SELF,
      currency: CurrencyType.KRW,
      currentValue: 0,
      initialInvestment: 0,
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
              <Label htmlFor="custom-owner" className="mb-2 block">소유자 이름</Label>
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
            <DialogTitle>새 투자 계좌 추가</DialogTitle>
            <DialogDescription>
              새로운 투자 계좌의 정보를 입력해주세요. 기본 정보와 평가금액을 입력하면 계좌가
              추가됩니다.
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
                {/* 계좌 유형 */}
                <div>
                  <label className="block mb-2 text-sm font-medium">계좌 유형</label>
                  <Select
                    value={formData.accountType}
                    onValueChange={(value) => handleChange("accountType", value)}
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

                {/* 계좌 소유자 */}
                <div>
                  <label className="block mb-2 text-sm font-medium">계좌 소유자</label>
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
                    <SelectTrigger className="w-full">
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

                {/* 화폐 유형 */}
                <div>
                  <label className="block mb-2 text-sm font-medium">화폐</label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => handleChange("currency", value as CurrencyType)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="화폐 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={CurrencyType.KRW}>원</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {/* 현재 평가 금액 */}
                <div>
                  <Label htmlFor="current-value">
                    현재 평가 금액 ({formData.currency === CurrencyType.KRW ? "만원" : "달러"})
                  </Label>
                  <Input
                    id="current-value"
                    type="text"
                    value={formData.currentValue > 0 ? formData.currentValue.toLocaleString() : ""}
                    onChange={(e) => handleChange("currentValue", e.target.value)}
                    placeholder={`${formData.currency === CurrencyType.KRW ? "만원" : "달러"} 단위로 입력`}
                    className="mt-2"
                  />
                </div>

                {/* 투자 원금 */}
                <div>
                  <Label htmlFor="initial-investment">
                    투자 원금 ({formData.currency === CurrencyType.KRW ? "만원" : "달러"})
                  </Label>
                  <Input
                    id="initial-investment"
                    type="text"
                    value={
                      formData.initialInvestment ? formData.initialInvestment.toLocaleString() : ""
                    }
                    onChange={(e) => handleChange("initialInvestment", e.target.value)}
                    placeholder={
                      formData.currentValue
                        ? `${Math.round(formData.currentValue * 0.5).toLocaleString()} (평가금액의 50%)`
                        : `미입력시 평가금액의 50%`
                    }
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
