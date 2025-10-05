"use client";

import { useState } from "react";
import { AssetNameInput } from "@web/components/ui/asset-name-input";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader } from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@web/components/ui/popover";
import { ACCOUNT_COLORS } from "@web/features/investments/types/constants";
import { InvestmentItem } from "@web/features/investments/types/types";
import { numberToKorean } from "@web/utils/number-format";
import { AddHistoryModal } from "./add-history-modal";

interface InvestmentItemComponentProps {
  item: InvestmentItem;
  onUpdateItem: (id: number, field: keyof InvestmentItem, value: string) => void;
  onRemoveHistoryRecord: (id: number, date: string) => void;
  onAddHistory: (
    itemId: number,
    date: string,
    initialInvestment: number,
    currentValue: number
  ) => void;
  onRemoveInvestment: (id: number) => void;
}

export function InvestmentItemComponent({
  item,
  onUpdateItem,
  onRemoveHistoryRecord,
  onAddHistory,
  onRemoveInvestment,
}: InvestmentItemComponentProps) {
  const [isRecordsExpanded, setIsRecordsExpanded] = useState(false);
  const [isAddHistoryModalOpen, setIsAddHistoryModalOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  const handleColorChange = (color: string) => {
    onUpdateItem(item.id, "color", color);
    setIsColorPickerOpen(false);
  };

  return (
    <Card key={item.id} className="gap-4">
      <CardHeader>
        <div className="flex gap-2 flex-wrap sm:items-center max-sm:flex-col ">
          <div className="flex items-center gap-2">
            <Popover open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: item.color }}
                  title="색상 변경"
                />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">계좌 색상 선택</p>
                  <div className="grid grid-cols-5 gap-2">
                    {ACCOUNT_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => handleColorChange(color)}
                        className="w-8 h-8 rounded border-2 hover:scale-110 transition-transform"
                        style={{
                          backgroundColor: color,
                          borderColor:
                            color === item.color ? "hsl(var(--foreground))" : "transparent",
                        }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Badge variant={"secondary"}>{`${item.accountType} / ${item.accountOwner}`}</Badge>
          </div>
          <div
            className="flex justify-between items-center flex-grow-1 flex-wrap"
            onClick={() => setIsRecordsExpanded(!isRecordsExpanded)}
          >
            <AssetNameInput
              id={item.id}
              value={item.accountName}
              onChange={(value) => onUpdateItem(item.id, "accountName", value)}
            />
            <Button size={"sm"} variant={"ghost"}>
              {isRecordsExpanded ? "접기" : "상세 보기"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-full flex gap-4 flex-wrap justify-between">
          <div className="flex items-center gap-2 relative flex-grow-1">
            <Label htmlFor={`initialInvestment-${item.id}`} className="text-sm ">
              투자원금
            </Label>
            <Input
              id={`initialInvestment-${item.id}`}
              type="text"
              value={
                item.initialInvestment && item.initialInvestment > 0
                  ? item.initialInvestment.toLocaleString()
                  : ""
              }
              onChange={(e) => onUpdateItem(item.id, "initialInvestment", e.target.value)}
              placeholder="투자원금 입력"
              className="text-sm flex-1"
            />
            {!!item.initialInvestment && item.initialInvestment > 0 && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs   px-1 z-10 pointer-events-none">
                {numberToKorean(item.initialInvestment)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 relative flex-grow-1">
            <Label htmlFor={`currentValue-${item.id}`} className="text-sm ">
              평가금액
            </Label>
            <Input
              id={`currentValue-${item.id}`}
              type="text"
              value={
                item.currentValue && item.currentValue > 0 ? item.currentValue.toLocaleString() : ""
              }
              onChange={(e) => onUpdateItem(item.id, "currentValue", e.target.value)}
              placeholder="평가금액 입력"
              className="text-sm flex-1"
            />
            {!!item.currentValue && item.currentValue > 0 && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs px-1 z-10 pointer-events-none">
                {numberToKorean(item.currentValue)}
              </div>
            )}
          </div>
        </div>

        {isRecordsExpanded && (
          <div className="w-full space-y-3">
            {item.records.length > 0 && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    히스토리
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddHistoryModalOpen(true)}
                    className="h-7 text-xs"
                  >
                    + 기록 추가
                  </Button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {item.records
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((record, index) => {
                      const isLatest = index === 0;
                      return (
                        <div
                          key={`${record.date}-${index}`}
                          className="flex flex-wrap sm:justify-between gap-2 sm:items-center p-2 rounded-lg border max-sm:flex-col"
                        >
                          <div className="text-sm">
                            {new Date(record.date).toLocaleDateString("ko-KR")}
                            {!isLatest && (
                              <span
                                className="ml-1 text-xs cursor-pointer underline"
                                onClick={() => onRemoveHistoryRecord(item.id, record.date)}
                              >
                                삭제
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex gap-2 text-sm flex-wrap">
                              <span>원금: {numberToKorean(record.initialInvestment)}</span>
                              <span>평가: {numberToKorean(record.currentValue)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
            <div className="flex">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemoveInvestment(item.id)}
                className="text-xs ml-auto underline"
              >
                계좌 삭제
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <AddHistoryModal
        isOpen={isAddHistoryModalOpen}
        onClose={() => setIsAddHistoryModalOpen(false)}
        item={item}
        onAddHistory={onAddHistory}
      />
    </Card>
  );
}
