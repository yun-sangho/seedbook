"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@web/components/ui/dialog";
import { Label } from "@web/components/ui/label";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { ACCOUNT_TYPES } from "@web/features/investments/types/constants";

interface AddInvestmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddInvestmentModal({ isOpen, onClose }: AddInvestmentModalProps) {
  const addInvestmentWithType = useInvestmentStore((state) => state.addInvestmentWithType);

  const handleAccountTypeSelect = (accountType: string) => {
    addInvestmentWithType(accountType);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>새 투자 계좌 추가</DialogTitle>
          <DialogDescription>추가할 투자 계좌의 유형을 선택해주세요.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div>
            <Label className="block mb-3 text-sm font-medium">계좌 유형</Label>
            <div className="grid grid-cols-2 gap-3">
              {ACCOUNT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleAccountTypeSelect(type)}
                  className="p-3 rounded-lg border-2 text-sm font-medium transition-all border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
