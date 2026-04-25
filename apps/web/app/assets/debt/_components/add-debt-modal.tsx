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
import { LOAN_TYPES } from "@web/features/debts/types/constants";

interface AddDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDebtAdded?: () => void;
}

export function AddDebtModal({ isOpen, onClose, onDebtAdded }: AddDebtModalProps) {
  const addDebt = useDebtsStore((state) => state.addDebt);

  const [selectedLoanType, setSelectedLoanType] = useState<string>("");

  const handleAddDebt = () => {
    if (selectedLoanType) {
      addDebt({ loanType: selectedLoanType });
      setSelectedLoanType("");
      onClose();
      onDebtAdded?.();
    }
  };

  const handleClose = () => {
    setSelectedLoanType("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>새 대출 추가</DialogTitle>
          <DialogDescription>추가할 대출의 유형을 선택해주세요.</DialogDescription>
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

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              취소
            </Button>
            <Button onClick={handleAddDebt} disabled={!selectedLoanType}>
              추가하기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
