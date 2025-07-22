"use client";

import { useState } from "react";
import { AssetNameInput } from "@web/components/ui/asset-name-input";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { InvestmentItem } from "@web/features/investments/types/types";
import { numberToKorean } from "@web/utils/number-format";

interface InvestmentItemComponentProps {
  item: InvestmentItem;
  onUpdateItem: (id: number, field: keyof InvestmentItem, value: string) => void;
  onRemoveHistoryRecord: (id: number, date: string) => void;
}

export function InvestmentItemComponent({
  item,
  onUpdateItem,
  onRemoveHistoryRecord,
}: InvestmentItemComponentProps) {
  // 투자기록 접기/펼치기 상태 관리
  const [isRecordsExpanded, setIsRecordsExpanded] = useState(false);

  return (
    <div
      key={item.id}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col gap-2 px-3 py-2"
    >
      <div className="flex gap-2 flex-wrap justify-between items-center">
        <Badge variant={"secondary"}>{`${item.accountType} / ${item.accountOwner}`}</Badge>
        <AssetNameInput
          id={item.id}
          value={item.accountName}
          onChange={(value) => onUpdateItem(item.id, "accountName", value)}
          className="flex-grow-1"
        />
        <div
          className="flex justify-between items-center"
          onClick={() => setIsRecordsExpanded(!isRecordsExpanded)}
        >
          <Button size={"sm"} variant={"ghost"}>
            {isRecordsExpanded ? "접기" : "상세 보기"}
          </Button>
        </div>
      </div>

      <div className="w-full flex gap-4 flex-wrap justify-between">
        <div className="flex items-center gap-2 relative flex-grow-1">
          <Label className="text-sm text-gray-600 dark:text-gray-400">투자원금</Label>
          <Input
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
          {item.initialInvestment && item.initialInvestment > 0 && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-1 z-10 pointer-events-none">
              {numberToKorean(item.initialInvestment)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 relative flex-grow-1">
          <Label className="text-sm text-gray-600 dark:text-gray-400">평가금액</Label>
          <Input
            type="text"
            value={
              item.currentValue && item.currentValue > 0 ? item.currentValue.toLocaleString() : ""
            }
            onChange={(e) => onUpdateItem(item.id, "currentValue", e.target.value)}
            placeholder="평가금액 입력"
            className="text-sm flex-1"
          />
          {item.currentValue && item.currentValue > 0 && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-1 z-10 pointer-events-none">
              {numberToKorean(item.currentValue)}
            </div>
          )}
        </div>
      </div>

      {item.records.length > 0 && (
        <div className="w-full space-y-1">
          {isRecordsExpanded && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {item.records
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((record, index) => {
                  const isLatest = index === 0;
                  return (
                    <div
                      key={`${record.date}-${index}`}
                      className="flex flex-wrap justify-between gap-2 items-center p-2 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(record.date).toLocaleDateString("ko-KR")}
                        {isLatest ? (
                          <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">
                            (최신)
                          </span>
                        ) : (
                          <span
                            className="ml-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer underline"
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
          )}
        </div>
      )}
    </div>
  );
}
