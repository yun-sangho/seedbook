"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@web/components/ui/dialog";
import { Label } from "@web/components/ui/label";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import {
  ACCOUNT_TYPES_BY_CATEGORY,
  DEFAULT_OWNERS,
  SAVINGS_CATEGORIES,
} from "@web/features/savings/types/constants";

interface AddSavingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavingsAdded?: () => void;
}

export function AddSavingsModal({ isOpen, onClose, onSavingsAdded }: AddSavingsModalProps) {
  const addSavingsWithTypeAndOwner = useSavingsStore((state) => state.addSavingsWithTypeAndOwner);
  const customOwners = useSavingsStore((state) => state.customOwners);

  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedAccountType, setSelectedAccountType] = useState<string>("");
  const [selectedOwner, setSelectedOwner] = useState<string>("");

  // 계좌 소유자 옵션 (기본 + 사용자 추가)
  const accountOwners = [...DEFAULT_OWNERS, ...customOwners];

  // 선택된 카테고리의 계좌 타입 목록
  const availableAccountTypes = selectedCategory
    ? ACCOUNT_TYPES_BY_CATEGORY[selectedCategory as keyof typeof ACCOUNT_TYPES_BY_CATEGORY] || []
    : [];

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSelectedAccountType(""); // 카테고리 변경 시 계좌 타입 초기화
  };

  const handleAddAccount = () => {
    if (selectedAccountType && selectedOwner) {
      addSavingsWithTypeAndOwner(selectedAccountType, selectedOwner);
      setSelectedCategory("");
      setSelectedAccountType("");
      setSelectedOwner("");
      onClose();
      onSavingsAdded?.();
    }
  };

  const handleClose = () => {
    setSelectedCategory("");
    setSelectedAccountType("");
    setSelectedOwner("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>새 저축 계좌 추가</DialogTitle>
          <DialogDescription>
            추가할 저축 계좌의 카테고리, 유형, 소유자를 선택해주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* 계좌 카테고리 선택 */}
          <div>
            <Label className="block mb-3 text-sm font-medium">계좌 카테고리</Label>
            <div className="grid grid-cols-3 gap-2">
              {SAVINGS_CATEGORIES.map((category) => (
                <Button
                  key={category}
                  type="button"
                  size={"lg"}
                  variant={selectedCategory === category ? "default" : "outline"}
                  onClick={() => handleCategorySelect(category)}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {/* 계좌 유형 선택 (카테고리 선택 후에만 표시) */}
          {selectedCategory && (
            <div>
              <Label className="block mb-3 text-sm font-medium">계좌 유형</Label>
              <div className="grid grid-cols-2 gap-2">
                {availableAccountTypes.map((type) => (
                  <Button
                    key={type}
                    type="button"
                    size={"lg"}
                    variant={selectedAccountType === type ? "default" : "outline"}
                    onClick={() => setSelectedAccountType(type)}
                  >
                    {type}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* 계좌 소유자 선택 (계좌 유형 선택 후에만 표시) */}
          {selectedAccountType && (
            <div>
              <Label className="block mb-3 text-sm font-medium">계좌 소유자</Label>
              <div className="grid grid-cols-2 gap-2">
                {accountOwners.map((owner) => (
                  <Button
                    key={owner}
                    type="button"
                    size={"lg"}
                    onClick={() => setSelectedOwner(owner)}
                    variant={selectedOwner === owner ? "default" : "outline"}
                  >
                    {owner}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              취소
            </Button>
            <Button onClick={handleAddAccount} disabled={!selectedAccountType || !selectedOwner}>
              계좌 추가
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
