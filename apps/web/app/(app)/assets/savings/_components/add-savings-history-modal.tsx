"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@web/components/ui/dialog";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { SavingsItem } from "@web/features/savings/types/types";
import { numberToKorean } from "@web/utils/number-format";

interface AddSavingsHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: SavingsItem;
  onAddHistory: (itemId: string, date: string, balance: number) => void;
}

export function AddSavingsHistoryModal({
  isOpen,
  onClose,
  item,
  onAddHistory,
}: AddSavingsHistoryModalProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [balance, setBalance] = useState("");
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // 오늘 날짜를 YYYY-MM-DD 형식으로 가져오기
  const today = new Date().toISOString().split("T")[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { [key: string]: string } = {};

    // 유효성 검사
    if (!selectedDate) {
      newErrors.date = "날짜를 선택해주세요.";
    } else if (new Date(selectedDate) > new Date()) {
      newErrors.date = "미래 날짜는 선택할 수 없습니다.";
    }

    if (!balance) {
      newErrors.balance = "잔액을 입력해주세요.";
    } else if (isNaN(Number(balance.replace(/,/g, ""))) || Number(balance.replace(/,/g, "")) < 0) {
      newErrors.balance = "올바른 잔액을 입력해주세요.";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      // 히스토리 추가
      onAddHistory(item.id, selectedDate, Number(balance.replace(/,/g, "")));

      // 폼 초기화
      setSelectedDate("");
      setBalance("");
      setErrors({});
      onClose();
    }
  };

  const handleClose = () => {
    setSelectedDate("");
    setBalance("");
    setErrors({});
    onClose();
  };

  // 숫자 입력 포맷팅
  const formatNumber = (value: string) => {
    const numericValue = value.replace(/[^0-9]/g, "");
    return numericValue ? Number(numericValue).toLocaleString() : "";
  };

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatNumber(e.target.value);
    setBalance(formatted);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>히스토리 추가 - {item.accountName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor={`history-date-${item.id}`} className="text-sm font-medium">
              날짜 <span className="text-red-500">*</span>
            </Label>
            <Input
              id={`history-date-${item.id}`}
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={today}
              className="mt-1"
            />
            {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date}</p>}
          </div>

          <div>
            <Label htmlFor={`history-balance-${item.id}`} className="text-sm font-medium">
              잔액 <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id={`history-balance-${item.id}`}
                type="text"
                value={balance}
                onChange={handleBalanceChange}
                placeholder="잔액 입력"
                className="mt-1"
                data-1p-ignore
                aria-describedby={
                  balance && Number(balance.replace(/,/g, "")) > 0
                    ? `history-balanceHint-${item.id}`
                    : undefined
                }
              />
              {!!balance && Number(balance.replace(/,/g, "")) > 0 && (
                <div
                  id={`history-balanceHint-${item.id}`}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs px-1 z-10 pointer-events-none"
                >
                  {numberToKorean(Number(balance.replace(/,/g, "")))}
                </div>
              )}
            </div>
            {errors.balance && <p className="text-red-500 text-xs mt-1">{errors.balance}</p>}
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              취소
            </Button>
            <Button type="submit" className="flex-1">
              추가
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
