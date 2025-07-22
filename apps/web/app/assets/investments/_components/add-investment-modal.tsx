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
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { ACCOUNT_TYPES, DEFAULT_OWNERS } from "@web/features/investments/types/constants";

interface AddInvestmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddInvestmentModal({ isOpen, onClose }: AddInvestmentModalProps) {
  const addInvestmentWithTypeAndOwner = useInvestmentStore(
    (state) => state.addInvestmentWithTypeAndOwner
  );
  const customOwners = useInvestmentStore((state) => state.customOwners);

  const [selectedAccountType, setSelectedAccountType] = useState<string>("");
  const [selectedOwner, setSelectedOwner] = useState<string>("");

  // 계좌 소유자 옵션 (기본 + 사용자 추가)
  const accountOwners = [...DEFAULT_OWNERS, ...customOwners];

  const handleAddAccount = () => {
    if (selectedAccountType && selectedOwner) {
      addInvestmentWithTypeAndOwner(selectedAccountType, selectedOwner);
      setSelectedAccountType("");
      setSelectedOwner("");
      onClose();
    }
  };

  const handleClose = () => {
    setSelectedAccountType("");
    setSelectedOwner("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>새 투자 계좌 추가</DialogTitle>
          <DialogDescription>추가할 투자 계좌의 유형과 소유자를 선택해주세요.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div>
            <Label className="block mb-3 text-sm font-medium">계좌 유형</Label>
            <div className="grid grid-cols-2 gap-2">
              {ACCOUNT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedAccountType(type)}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    selectedAccountType === type
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300"
                      : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="block mb-3 text-sm font-medium">계좌 소유자</Label>
            <div className="grid grid-cols-2 gap-2">
              {accountOwners.map((owner) => (
                <button
                  key={owner}
                  type="button"
                  onClick={() => setSelectedOwner(owner)}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    selectedOwner === owner
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300"
                      : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
                  }`}
                >
                  {owner}
                </button>
              ))}
            </div>
          </div>

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
