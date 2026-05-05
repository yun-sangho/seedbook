"use client";

import { useState } from "react";
import { AssetNameInput } from "@web/components/ui/asset-name-input";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader } from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@web/components/ui/popover";
import { ACCOUNT_COLORS } from "@web/features/savings/types/constants";
import type { SavingsItem } from "@web/features/savings/types/types";
import { numberToKorean } from "@web/utils/number-format";
import { AddSavingsHistoryModal } from "./add-savings-history-modal";

interface SavingsItemComponentProps {
  item: SavingsItem;
  onUpdateItem: (id: string, field: keyof SavingsItem, value: string) => void;
  onRemoveHistoryRecord: (id: string, date: string) => void;
  onAddHistory: (id: string, date: string, balance: number) => void;
  onRemoveSavings: (id: string) => void;
  readOnly?: boolean;
  ownerLabel?: string | null;
}

export function SavingsItemComponent({
  item,
  onUpdateItem,
  onRemoveHistoryRecord,
  onAddHistory,
  onRemoveSavings,
  readOnly = false,
  ownerLabel = null,
}: SavingsItemComponentProps) {
  const [isRecordsExpanded, setIsRecordsExpanded] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const handleColorChange = (color: string) => {
    onUpdateItem(item.id, "color", color);
    setIsColorPickerOpen(false);
  };

  const handleAddHistory = () => {
    setIsHistoryModalOpen(true);
  };

  return (
    <Card
      key={item.id}
      className={`gap-4 ${readOnly ? "border-amber-300 dark:border-amber-700" : ""}`}
    >
      <CardHeader>
        {readOnly && ownerLabel && (
          <Badge
            variant="secondary"
            className="self-start mb-1 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100 border border-amber-300 dark:border-amber-700"
          >
            공유대상 데이터 · {ownerLabel}
          </Badge>
        )}
        <div className="flex gap-2 flex-wrap sm:items-center max-sm:flex-col ">
          <div className="flex items-center gap-2">
            {readOnly ? (
              <div
                className="w-6 h-6 rounded"
                style={{ backgroundColor: item.color }}
                aria-label="계좌 색상"
              />
            ) : (
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
            )}
            <Badge variant={"secondary"}>{item.accountType}</Badge>
          </div>
          <div
            className="flex justify-between items-center flex-grow-1 flex-wrap"
            onClick={() => setIsRecordsExpanded(!isRecordsExpanded)}
          >
            {readOnly ? (
              <span className="text-md font-bold text-gray-900 dark:text-white">
                {item.accountName}
              </span>
            ) : (
              <AssetNameInput
                id={item.id}
                value={item.accountName}
                onChange={(value) => onUpdateItem(item.id, "accountName", value)}
              />
            )}
            <Button size={"sm"} variant={"ghost"}>
              {isRecordsExpanded ? "접기" : "상세 보기"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-full flex gap-4 flex-wrap justify-between">
          <div className="flex items-center gap-2 relative flex-grow-1">
            <Label htmlFor={`balance-${item.id}`} className="text-sm ">
              잔액
            </Label>
            <Input
              id={`balance-${item.id}`}
              type="text"
              value={item.balance && item.balance > 0 ? item.balance.toLocaleString() : ""}
              onChange={
                readOnly ? undefined : (e) => onUpdateItem(item.id, "balance", e.target.value)
              }
              placeholder="잔액 입력"
              readOnly={readOnly}
              tabIndex={readOnly ? -1 : 0}
              className={`text-sm flex-1 ${readOnly ? "bg-muted/30 cursor-default" : ""}`}
            />
            {!!item.balance && item.balance > 0 && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs   px-1 z-10 pointer-events-none">
                {numberToKorean(item.balance)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 relative flex-grow-1">
            <Label htmlFor={`interestRate-${item.id}`} className="text-sm ">
              이율(%)
            </Label>
            <Input
              id={`interestRate-${item.id}`}
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={item.interestRate ?? ""}
              onChange={
                readOnly ? undefined : (e) => onUpdateItem(item.id, "interestRate", e.target.value)
              }
              placeholder="이율 입력 (선택)"
              readOnly={readOnly}
              tabIndex={readOnly ? -1 : 0}
              className={`text-sm flex-1 ${readOnly ? "bg-muted/30 cursor-default" : ""}`}
            />
          </div>
        </div>

        {isRecordsExpanded && (
          <div className="w-full space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">히스토리</span>
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddHistory}
                  className="h-7 text-xs"
                >
                  + 기록 추가
                </Button>
              )}
            </div>

            {item.records.length > 0 && (
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
                          {!readOnly && !isLatest && (
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
                            <span>잔액: {numberToKorean(record.balance)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {!readOnly && (
              <div className="flex">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveSavings(item.id)}
                  className="text-xs ml-auto underline"
                >
                  계좌 삭제
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {!readOnly && (
        <AddSavingsHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
          item={item}
          onAddHistory={onAddHistory}
        />
      )}
    </Card>
  );
}
