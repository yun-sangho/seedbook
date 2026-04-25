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
import { RealAssetType } from "@web/features/real-assets/types/constants";
import { RealAssetItem } from "@web/features/real-assets/types/types";
import { CurrencyType } from "@web/types/account.consts";
import { numberToKorean } from "@web/utils/number-format";
import { Trash2 } from "lucide-react";

interface RealAssetItemComponentProps {
  item: RealAssetItem;
  onUpdateAsset: (id: string, field: keyof RealAssetItem, value: string | number) => void;
  onRemoveAsset: (id: string) => void;
}

export function RealAssetItemComponent({
  item,
  onUpdateAsset,
  onRemoveAsset,
}: RealAssetItemComponentProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const profitLoss = item.currentValue - item.purchaseValue;
  const profitLossRate = item.purchaseValue > 0 ? (profitLoss / item.purchaseValue) * 100 : 0;

  return (
    <Card key={item.id} className="gap-4">
      <CardHeader>
        <div className="flex gap-2 flex-wrap sm:items-center max-sm:flex-col">
          <div className="flex items-center gap-2">
            <Badge variant={"secondary"}>{item.assetType}</Badge>
          </div>
          <div className="flex justify-between items-center flex-grow-1 flex-wrap">
            <AssetNameInput
              id={item.id}
              value={item.assetName}
              onChange={(value) => onUpdateAsset(item.id, "assetName", value)}
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
            <Label htmlFor={`purchaseValue-${item.id}`} className="text-sm">
              구입 금액
            </Label>
            <AssetValueInput
              id={`purchaseValue-${item.id}`}
              value={item.purchaseValue}
              currency={CurrencyType.KRW}
              onChange={(value) => onUpdateAsset(item.id, "purchaseValue", value)}
            />
          </div>

          <div className="flex items-center gap-2 relative flex-grow-1">
            <Label htmlFor={`currentValue-${item.id}`} className="text-sm">
              현재 가치
            </Label>
            <AssetValueInput
              id={`currentValue-${item.id}`}
              value={item.currentValue}
              currency={CurrencyType.KRW}
              onChange={(value) => onUpdateAsset(item.id, "currentValue", value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-sm">평가손익</Label>
            <p
              className={`text-sm font-medium ${
                profitLoss > 0
                  ? "text-red-600 dark:text-red-400"
                  : profitLoss < 0
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-600 dark:text-gray-400"
              }`}
            >
              {numberToKorean(profitLoss.toString())}원 ({profitLossRate > 0 ? "+" : ""}
              {profitLossRate.toFixed(2)}%)
            </p>
          </div>
        </div>

        {isExpanded && (
          <div className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor={`assetType-${item.id}`}>자산 유형</Label>
                <Select
                  value={item.assetType}
                  onValueChange={(value) => onUpdateAsset(item.id, "assetType", value)}
                >
                  <SelectTrigger id={`assetType-${item.id}`}>
                    <SelectValue placeholder="자산 유형 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(RealAssetType).map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor={`purchaseDate-${item.id}`}>구입일</Label>
                <Input
                  id={`purchaseDate-${item.id}`}
                  type="date"
                  value={item.purchaseDate}
                  onChange={(e) => onUpdateAsset(item.id, "purchaseDate", e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor={`note-${item.id}`}>메모</Label>
                <Textarea
                  id={`note-${item.id}`}
                  placeholder="메모 추가"
                  value={item.note}
                  onChange={(e) => onUpdateAsset(item.id, "note", e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onRemoveAsset(item.id)}
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
