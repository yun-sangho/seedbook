"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@web/components/ui/dialog";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { numberToKorean, parseNumericString } from "@web/utils/number-format";

interface AddCashItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountName: string;
  onAdd: (label: string, amount: number) => void;
}

export function AddCashItemModal({ isOpen, onClose, accountName, onAdd }: AddCashItemModalProps) {
  const [label, setLabel] = useState("예수금");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<{ label?: string; amount?: string }>({});

  const reset = () => {
    setLabel("예수금");
    setAmount("");
    setErrors({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!label.trim()) next.label = "항목명을 입력해주세요.";
    const parsed = parseNumericString(amount);
    if (!amount || parsed <= 0) next.amount = "금액을 올바르게 입력해주세요.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onAdd(label.trim(), parsed);
    reset();
    onClose();
  };

  const parsedAmount = parseNumericString(amount);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : handleClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>현금 항목 추가 - {accountName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="add-cash-label" className="text-sm font-medium">
              항목명 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="add-cash-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예수금 / CMA / MMF …"
              className="mt-1"
            />
            {errors.label && <p className="text-red-500 text-xs mt-1">{errors.label}</p>}
          </div>

          <div>
            <Label htmlFor="add-cash-amount" className="text-sm font-medium">
              금액 <span className="text-red-500">*</span>
            </Label>
            <div className="relative mt-1">
              <Input
                id="add-cash-amount"
                type="text"
                value={parsedAmount > 0 ? parsedAmount.toLocaleString() : amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="금액 입력"
                className="pr-14"
                data-1p-ignore
              />
              {parsedAmount > 0 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  {numberToKorean(parsedAmount)}
                </div>
              )}
            </div>
            {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount}</p>}
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              취소
            </Button>
            <Button type="submit" className="flex-1">
              생성하기
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
