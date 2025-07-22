"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@web/components/ui/dialog";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { InvestmentItem } from "@web/features/investments/types/types";

interface AddHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InvestmentItem;
  onAddHistory: (
    itemId: number,
    date: string,
    initialInvestment: number,
    currentValue: number
  ) => void;
}

export function AddHistoryModal({ isOpen, onClose, item, onAddHistory }: AddHistoryModalProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [initialInvestment, setInitialInvestment] = useState("");
  const [currentValue, setCurrentValue] = useState("");
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

    if (!currentValue) {
      newErrors.currentValue = "평가금액을 입력해주세요.";
    } else if (
      isNaN(Number(currentValue.replace(/,/g, ""))) ||
      Number(currentValue.replace(/,/g, "")) <= 0
    ) {
      newErrors.currentValue = "올바른 평가금액을 입력해주세요.";
    }

    if (
      initialInvestment &&
      (isNaN(Number(initialInvestment.replace(/,/g, ""))) ||
        Number(initialInvestment.replace(/,/g, "")) < 0)
    ) {
      newErrors.initialInvestment = "올바른 투자원금을 입력해주세요.";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      // 히스토리 추가
      onAddHistory(
        item.id,
        selectedDate,
        initialInvestment ? Number(initialInvestment.replace(/,/g, "")) : 0,
        Number(currentValue.replace(/,/g, ""))
      );

      // 폼 초기화
      setSelectedDate("");
      setInitialInvestment("");
      setCurrentValue("");
      setErrors({});
      onClose();
    }
  };

  const handleClose = () => {
    setSelectedDate("");
    setInitialInvestment("");
    setCurrentValue("");
    setErrors({});
    onClose();
  };

  // 숫자 입력 포맷팅
  const formatNumber = (value: string) => {
    const numericValue = value.replace(/[^0-9]/g, "");
    return numericValue ? Number(numericValue).toLocaleString() : "";
  };

  const handleInitialInvestmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatNumber(e.target.value);
    setInitialInvestment(formatted);
  };

  const handleCurrentValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatNumber(e.target.value);
    setCurrentValue(formatted);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>히스토리 추가 - {item.accountName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="date" className="text-sm font-medium">
              날짜 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={today}
              className="mt-1"
            />
            {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date}</p>}
          </div>

          <div>
            <Label htmlFor="initialInvestment" className="text-sm font-medium">
              투자원금
            </Label>
            <Input
              id="initialInvestment"
              type="text"
              value={initialInvestment}
              onChange={handleInitialInvestmentChange}
              placeholder="투자원금 입력 (선택사항)"
              className="mt-1"
            />
            {errors.initialInvestment && (
              <p className="text-red-500 text-xs mt-1">{errors.initialInvestment}</p>
            )}
          </div>

          <div>
            <Label htmlFor="currentValue" className="text-sm font-medium">
              평가금액 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="currentValue"
              type="text"
              value={currentValue}
              onChange={handleCurrentValueChange}
              placeholder="평가금액 입력"
              className="mt-1"
            />
            {errors.currentValue && (
              <p className="text-red-500 text-xs mt-1">{errors.currentValue}</p>
            )}
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
