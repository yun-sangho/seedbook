"use client";

import { useState } from "react";
import { AssetNameInput } from "@web/components/ui/asset-name-input";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { ACCOUNT_TYPES } from "@web/features/investments/types/constants";
import { InvestmentItem } from "@web/features/investments/types/types";
import { numberToKorean } from "@web/utils/number-format";

interface InvestmentItemComponentProps {
  item: InvestmentItem;
  accountOwners: string[];
  onUpdateItem: (id: number, field: keyof InvestmentItem, value: string) => void;
  onRemoveHistoryRecord: (id: number, date: string) => void;
}

export function InvestmentItemComponent({
  item,
  accountOwners,
  onUpdateItem,
  onRemoveHistoryRecord,
}: InvestmentItemComponentProps) {
  // 투자기록 접기/펼치기 상태 관리
  const [isRecordsExpanded, setIsRecordsExpanded] = useState(false);

  return (
    <div
      key={item.id}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col gap-1 p-3"
    >
      <div className="flex gap-2 flex-wrap justify-between items-center">
        <AssetNameInput
          id={item.id}
          value={item.accountName}
          onChange={(value) => onUpdateItem(item.id, "accountName", value)}
          className="flex-grow-1"
        />
        <div className="flex gap-2 flex-wrap justify-between items-center">
          <div className="w-36">
            <Select
              value={item.accountType}
              onValueChange={(value) => onUpdateItem(item.id, "accountType", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="계좌 유형" />
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
          <div className="w-24">
            <Select
              value={item.accountOwner}
              onValueChange={(value) => onUpdateItem(item.id, "accountOwner", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="소유자" />
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
      </div>

      <div className="w-full flex gap-2 flex-wrap">
        <div className="flex-grow-1">
          <div className="flex items-center">
            <Label className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              투자원금 ({item.currency === "원" ? "만원" : "달러"})
            </Label>
            <span className="ml-auto text-sm text-gray-600 dark:text-gray-400 mb-2">
              {item.initialInvestment && item.initialInvestment > 0
                ? numberToKorean(item.initialInvestment)
                : "N/A"}
            </span>
          </div>
          <Input
            type="text"
            value={
              item.initialInvestment && item.initialInvestment > 0
                ? item.initialInvestment.toLocaleString()
                : ""
            }
            onChange={(e) => onUpdateItem(item.id, "initialInvestment", e.target.value)}
            placeholder="투자원금 입력"
            className="text-sm"
          />
        </div>
        <div className="flex-grow-1">
          <div className="flex items-center">
            <Label className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              평가금액 ({item.currency === "원" ? "만원" : "달러"})
            </Label>
            <span className="ml-auto text-sm text-gray-600 dark:text-gray-400 mb-2">
              {item.currentValue && item.currentValue > 0
                ? numberToKorean(item.currentValue)
                : "N/A"}
            </span>
          </div>
          <Input
            type="text"
            value={
              item.currentValue && item.currentValue > 0 ? item.currentValue.toLocaleString() : ""
            }
            onChange={(e) => onUpdateItem(item.id, "currentValue", e.target.value)}
            placeholder="평가금액 입력"
            className="text-sm"
          />
        </div>
      </div>

      {item.records.length > 0 && (
        <div className="w-full space-y-1">
          <div
            className="flex justify-between items-center"
            onClick={() => setIsRecordsExpanded(!isRecordsExpanded)}
          >
            <Label className="text-sm text-gray-600 dark:text-gray-400">변경 히스토리</Label>
            <Button size={"sm"} variant={"ghost"}>
              {isRecordsExpanded ? "접기" : "펼치기"}
            </Button>
          </div>

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
                          <span>
                            원금: {record.initialInvestment.toLocaleString()}{" "}
                            {item.currency === "원" ? "만원" : "달러"}
                          </span>
                          <span>
                            평가: {record.currentValue.toLocaleString()}{" "}
                            {item.currency === "원" ? "만원" : "달러"}
                          </span>
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
