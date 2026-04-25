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
import { ACCOUNT_TYPES } from "@web/features/investments/types/constants";

interface AddInvestmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvestmentAdded?: () => void;
}

export function AddInvestmentModal({
  isOpen,
  onClose,
  onInvestmentAdded,
}: AddInvestmentModalProps) {
  const addInvestmentWithType = useInvestmentStore((state) => state.addInvestmentWithType);

  const [selectedAccountType, setSelectedAccountType] = useState<string>("");

  const handleAddAccount = () => {
    if (selectedAccountType) {
      addInvestmentWithType(selectedAccountType);
      setSelectedAccountType("");
      onClose();
      onInvestmentAdded?.();
    }
  };

  const handleClose = () => {
    setSelectedAccountType("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>새 투자 계좌 추가</DialogTitle>
          <DialogDescription>추가할 투자 계좌의 유형을 선택해주세요.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div>
            <Label className="block mb-3 text-sm font-medium">계좌 유형</Label>
            <div className="grid grid-cols-2 gap-2">
              {ACCOUNT_TYPES.map((type) => (
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

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              취소
            </Button>
            <Button onClick={handleAddAccount} disabled={!selectedAccountType}>
              계좌 추가
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
