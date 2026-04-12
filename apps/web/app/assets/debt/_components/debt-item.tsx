"use client";

import { useState } from "react";
import { AssetNameInput } from "@web/components/ui/asset-name-input";
import { AssetValueInput } from "@web/components/ui/asset-value-input";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader } from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { Textarea } from "@web/components/ui/textarea";
import { DEFAULT_OWNERS, LOAN_TYPES } from "@web/features/debts/types/constants";
import { DebtsItem } from "@web/features/debts/types/types";
import { CurrencyType } from "@web/types/account.consts";
import { numberToKorean } from "@web/utils/number-format";
import { Trash2 } from "lucide-react";

interface DebtItemComponentProps {
  item: DebtsItem;
  onUpdateDebt: <K extends keyof DebtsItem>(id: string, key: K, value: DebtsItem[K]) => void;
  onRemoveDebt: (id: string) => void;
}

export function DebtItemComponent({ item, onUpdateDebt, onRemoveDebt }: DebtItemComponentProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 월 이자 계산
  const monthlyInterest = (item.amount * item.interestRate) / 100 / 12;

  // 만기까지 남은 기간 계산 (개월)
  const remainingMonths = item.maturityDate
    ? Math.max(
        0,
        Math.ceil(
          (new Date(item.maturityDate).getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24 * 30)
        )
      )
    : 0;

  return (
    <Card key={item.id} className="gap-4">
      <CardHeader>
        <div className="flex gap-2 flex-wrap sm:items-center max-sm:flex-col">
          <div className="flex items-center gap-2">
            <Badge variant={"secondary"}>{`${item.loanType} / ${item.loanOwner}`}</Badge>
          </div>
          <div className="flex justify-between items-center flex-grow-1 flex-wrap">
            <AssetNameInput
              id={item.id}
              value={item.loanName}
              onChange={(value) => onUpdateDebt(item.id, "loanName", value)}
            />
            <Button size={"sm"} variant={"ghost"} onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? "접기" : "상세 보기"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-full flex gap-4 flex-wrap justify-between">
          <div className="flex items-center gap-2 relative flex-grow-1">
            <Label htmlFor={`amount-${item.id}`} className="text-sm">
              대출 금액
            </Label>
            <AssetValueInput
              id={`amount-${item.id}`}
              value={item.amount}
              currency={CurrencyType.KRW}
              onChange={(value) => onUpdateDebt(item.id, "amount", parseInt(value) || 0)}
            />
          </div>

          <div className="flex items-center gap-2 relative flex-grow-1">
            <Label htmlFor={`interestRate-${item.id}`} className="text-sm">
              이자율
            </Label>
            <div className="relative flex-1">
              <Input
                id={`interestRate-${item.id}`}
                type="number"
                step="0.01"
                value={item.interestRate || ""}
                onChange={(e) =>
                  onUpdateDebt(item.id, "interestRate", parseFloat(e.target.value) || 0)
                }
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-sm">월 이자</Label>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              {numberToKorean(monthlyInterest.toString())}원
            </p>
          </div>
        </div>

        {isExpanded && (
          <div className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor={`loanType-${item.id}`}>대출 유형</Label>
                <Select
                  value={item.loanType}
                  onValueChange={(value) => onUpdateDebt(item.id, "loanType", value)}
                >
                  <SelectTrigger id={`loanType-${item.id}`}>
                    <SelectValue placeholder="대출 유형 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOAN_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor={`loanOwner-${item.id}`}>차주</Label>
                <Select
                  value={item.loanOwner}
                  onValueChange={(value) => onUpdateDebt(item.id, "loanOwner", value)}
                >
                  <SelectTrigger id={`loanOwner-${item.id}`}>
                    <SelectValue placeholder="차주 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_OWNERS.map((owner) => (
                      <SelectItem key={owner} value={owner}>
                        {owner}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor={`lender-${item.id}`}>대출기관</Label>
                <Input
                  id={`lender-${item.id}`}
                  placeholder="대출기관"
                  value={item.lender}
                  onChange={(e) => onUpdateDebt(item.id, "lender", e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor={`maturityDate-${item.id}`}>만기일</Label>
                <Input
                  id={`maturityDate-${item.id}`}
                  type="date"
                  value={item.maturityDate}
                  onChange={(e) => onUpdateDebt(item.id, "maturityDate", e.target.value)}
                />
                {remainingMonths > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    만기까지 약 {remainingMonths}개월 남음
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor={`monthlyPayment-${item.id}`}>월 상환금</Label>
                <AssetValueInput
                  id={`monthlyPayment-${item.id}`}
                  value={item.monthlyPayment}
                  currency={CurrencyType.KRW}
                  onChange={(value) =>
                    onUpdateDebt(item.id, "monthlyPayment", parseInt(value) || 0)
                  }
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor={`note-${item.id}`}>메모</Label>
                <Textarea
                  id={`note-${item.id}`}
                  placeholder="메모 추가"
                  value={item.note}
                  onChange={(e) => onUpdateDebt(item.id, "note", e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onRemoveDebt(item.id)}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                삭제
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
