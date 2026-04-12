"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@web/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@web/components/ui/dialog";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { StockCombobox } from "@web/features/investments/components/stock-combobox";
import type { Stock } from "@web/features/investments/types/stock";
import { parseNumericString } from "@web/utils/number-format";

interface AddStockHoldingModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountName: string;
  existingHoldingKeys: Set<string>;
  onAdd: (stock: Stock, quantity: number) => void;
}

export function AddStockHoldingModal({
  isOpen,
  onClose,
  accountName,
  existingHoldingKeys,
  onAdd,
}: AddStockHoldingModalProps) {
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [quantity, setQuantity] = useState("");
  const [errors, setErrors] = useState<{ stock?: string; quantity?: string }>({});
  const stockTriggerRef = useRef<HTMLButtonElement>(null);

  // 모달이 열리면 종목 검색 팝오버를 자동으로 열어 사용자가 바로 검색어를 입력할 수 있게 한다.
  // Radix Dialog 의 초기 focus 처리가 끝난 뒤에 click 을 날려야 팝오버가 닫히지 않는다.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => stockTriggerRef.current?.click(), 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  const reset = () => {
    setSelectedStock(null);
    setQuantity("");
    setErrors({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!selectedStock) next.stock = "종목을 선택해주세요.";
    const parsed = parseNumericString(quantity);
    if (!quantity || parsed <= 0) next.quantity = "수량을 올바르게 입력해주세요.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onAdd(selectedStock!, parsed);
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : handleClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>종목 추가 - {accountName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-sm font-medium">
              종목 <span className="text-red-500">*</span>
            </Label>
            <div className="mt-1">
              <StockCombobox
                ref={stockTriggerRef}
                value={selectedStock}
                onSelect={(stock) => setSelectedStock(stock)}
                className="w-full"
                disabledKeys={existingHoldingKeys}
              />
            </div>
            {errors.stock && <p className="text-red-500 text-xs mt-1">{errors.stock}</p>}
          </div>

          <div>
            <Label htmlFor="add-holding-quantity" className="text-sm font-medium">
              수량 <span className="text-red-500">*</span>
            </Label>
            <div className="relative mt-1">
              <Input
                id="add-holding-quantity"
                type="text"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="보유 수량"
                className="pr-7"
                data-1p-ignore
              />
              {parseNumericString(quantity) > 0 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  주
                </div>
              )}
            </div>
            {errors.quantity && <p className="text-red-500 text-xs mt-1">{errors.quantity}</p>}
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
