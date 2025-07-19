"use client";

import { useState } from "react";
import { AssetNameInput } from "@web/components/ui/asset-name-input";
import { Button } from "@web/components/ui/button";
import { Calendar } from "@web/components/ui/calendar";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@web/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { ACCOUNT_TYPES } from "@web/features/investments/types/constants";
import { InvestmentItem, InvestmentRecord } from "@web/features/investments/types/types";
import { ChevronDownIcon } from "lucide-react";

interface InvestmentItemComponentProps {
  item: InvestmentItem;
  accountOwners: string[];
  onUpdateItem: (id: number, field: keyof InvestmentItem, value: string) => void;
  onAddRecord: (id: number) => void;
  onUpdateRecord: (
    id: number,
    recordIndex: number,
    field: keyof InvestmentRecord,
    value: string
  ) => void;
  onRemoveRecord: (id: number, recordIndex: number) => void;
}

export function InvestmentItemComponent({
  item,
  accountOwners,
  onUpdateItem,
  onAddRecord,
  onUpdateRecord,
  onRemoveRecord,
}: InvestmentItemComponentProps) {
  // 날짜 선택기 상태 관리 (각 기록별로)
  const [openDatePickers, setOpenDatePickers] = useState<{ [key: string]: boolean }>({});

  // 날짜 선택기 상태 관리 헬퍼 함수들
  const getDatePickerKey = (recordIndex: number) => `${item.id}-${recordIndex}`;

  const isDatePickerOpen = (recordIndex: number) => {
    return openDatePickers[getDatePickerKey(recordIndex)] || false;
  };

  const setDatePickerOpen = (recordIndex: number, open: boolean) => {
    const key = getDatePickerKey(recordIndex);
    setOpenDatePickers((prev) => ({ ...prev, [key]: open }));
  };

  return (
    <div
      key={item.id}
      className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700"
    >
      <div className="flex flex-col gap-4 p-6 flex-wrap">
        <div className="flex gap-2 flex-wrap justify-between">
          <AssetNameInput
            id={item.id}
            value={item.accountName}
            onChange={(value) => onUpdateItem(item.id, "accountName", value)}
            className=""
          />
          <div className="flex gap-2 flex-wrap justify-between">
            <div className="w-36 space-y-2">
              <Label
                htmlFor={`account-type-${item.id}`}
                className="text-sm font-medium text-gray-700 dark:text-white"
              >
                계좌 유형
              </Label>
              <Select
                value={item.accountType}
                onValueChange={(value) => onUpdateItem(item.id, "accountType", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="w-24 space-y-2">
              <Label
                htmlFor={`account-owner-${item.id}`}
                className="text-sm font-medium text-gray-600 dark:text-white"
              >
                소유자
              </Label>
              <Select
                value={item.accountOwner}
                onValueChange={(value) => onUpdateItem(item.id, "accountOwner", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {accountOwners.map((owner) => (
                      <SelectItem key={owner} value={owner}>
                        {owner}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="w-full flex flex-wrap gap-2">
            <div className="flex-1 space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-sm text-gray-600 dark:text-gray-400">투자 기록</Label>
                <button
                  type="button"
                  onClick={() => onAddRecord(item.id)}
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  + 기록 추가
                </button>
              </div>
            </div>
            {item.records.map((record, recordIndex) => (
              <div
                key={recordIndex}
                className="w-full flex justify-between p-4 gap-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
              >
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500 dark:text-gray-400">기준날짜</Label>
                  <Popover
                    open={isDatePickerOpen(recordIndex)}
                    onOpenChange={(open) => setDatePickerOpen(recordIndex, open)}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        {record.date
                          ? new Date(record.date).toLocaleDateString("ko-KR")
                          : "날짜 선택"}
                        <ChevronDownIcon className="ml-auto h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={record.date ? new Date(record.date) : undefined}
                        onSelect={(selectedDate) => {
                          if (selectedDate) {
                            const dateString = selectedDate.toISOString().split("T")[0];
                            if (dateString) {
                              onUpdateRecord(item.id, recordIndex, "date", dateString);
                              setDatePickerOpen(recordIndex, false);
                            }
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-grow-1 gap-4">
                  <div className="flex-grow-1 space-y-2">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">
                      평가금액 ({item.currency === "원" ? "만원" : "달러"})
                    </Label>
                    <Input
                      type="text"
                      value={
                        record.currentValue && record.currentValue > 0
                          ? record.currentValue.toLocaleString()
                          : ""
                      }
                      onChange={(e) =>
                        onUpdateRecord(item.id, recordIndex, "currentValue", e.target.value)
                      }
                      placeholder="평가금액"
                      className="text-xs"
                    />
                  </div>
                  <div className="flex-grow-1 space-y-2">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">
                      투자원금 ({item.currency === "원" ? "만원" : "달러"})
                    </Label>
                    <Input
                      type="text"
                      value={
                        record.initialInvestment && record.initialInvestment > 0
                          ? record.initialInvestment.toLocaleString()
                          : ""
                      }
                      onChange={(e) =>
                        onUpdateRecord(item.id, recordIndex, "initialInvestment", e.target.value)
                      }
                      placeholder="투자원금"
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onRemoveRecord(item.id, recordIndex)}
                    className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
