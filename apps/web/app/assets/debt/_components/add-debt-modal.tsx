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
import { useDebtsStore } from "@web/features/debts/stores/debts-store";
import { DEFAULT_OWNERS, LOAN_TYPES } from "@web/features/debts/types/constants";

interface AddDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDebtAdded?: () => void;
}

export function AddDebtModal({ isOpen, onClose, onDebtAdded }: AddDebtModalProps) {
  const addDebt = useDebtsStore((state) => state.addDebt);

  const [selectedLoanType, setSelectedLoanType] = useState<string>("");
  const [selectedOwner, setSelectedOwner] = useState<string>("");

  // 차주 옵션 (기본 + 사용자 추가)
  const loanOwners = [...DEFAULT_OWNERS];

  const handleAddDebt = () => {
    if (selectedLoanType && selectedOwner) {
      addDebt({ loanType: selectedLoanType, loanOwner: selectedOwner });

      setSelectedLoanType("");
      setSelectedOwner("");
      onClose();
      onDebtAdded?.();
    }
  };

  const handleClose = () => {
    setSelectedLoanType("");
    setSelectedOwner("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>새 대출 추가</DialogTitle>
          <DialogDescription>추가할 대출의 유형과 차주를 선택해주세요.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div>
            <Label className="block mb-3 text-sm font-medium">대출 유형</Label>
            <div className="grid grid-cols-2 gap-2">
              {LOAN_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  size={"lg"}
                  variant={selectedLoanType === type ? "default" : "outline"}
                  onClick={() => setSelectedLoanType(type)}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="block mb-3 text-sm font-medium">차주</Label>
            <div className="grid grid-cols-2 gap-2">
              {loanOwners.map((owner) => (
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

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              취소
            </Button>
            <Button onClick={handleAddDebt} disabled={!selectedLoanType || !selectedOwner}>
              추가하기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
