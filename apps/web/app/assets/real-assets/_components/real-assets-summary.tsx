"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { RealAssetItem } from "@web/features/real-assets/types/types";
import { calculateReturnRate, formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean, getProfitColorClass } from "@web/utils/profit-color";

interface RealAssetsSummaryProps {
  realAssets: RealAssetItem[];
}

export function RealAssetsSummary({ realAssets }: RealAssetsSummaryProps) {
  const totals = useMemo(() => {
    const totalPurchaseValue = realAssets.reduce(
      (sum, asset) => sum + (asset.purchaseValue || 0),
      0
    );
    const totalCurrentValue = realAssets.reduce((sum, asset) => sum + (asset.currentValue || 0), 0);
    const totalProfit = totalCurrentValue - totalPurchaseValue;
    const totalReturnRate = calculateReturnRate(totalCurrentValue, totalPurchaseValue);

    // 자산 유형별 집계
    const byType = realAssets.reduce(
      (acc, asset) => {
        const type = asset.assetType;
        if (!acc[type]) {
          acc[type] = {
            count: 0,
            purchaseValue: 0,
            currentValue: 0,
          };
        }
        acc[type].count += 1;
        acc[type].purchaseValue += asset.purchaseValue || 0;
        acc[type].currentValue += asset.currentValue || 0;
        return acc;
      },
      {} as Record<string, { count: number; purchaseValue: number; currentValue: number }>
    );

    // 소유자별 집계
    const byOwner = realAssets.reduce(
      (acc, asset) => {
        const owner = asset.assetOwner;
        if (!acc[owner]) {
          acc[owner] = {
            count: 0,
            purchaseValue: 0,
            currentValue: 0,
          };
        }
        acc[owner].count += 1;
        acc[owner].purchaseValue += asset.purchaseValue || 0;
        acc[owner].currentValue += asset.currentValue || 0;
        return acc;
      },
      {} as Record<string, { count: number; purchaseValue: number; currentValue: number }>
    );

    return {
      totalPurchaseValue,
      totalCurrentValue,
      totalProfit,
      totalReturnRate,
      byType,
      byOwner,
    };
  }, [realAssets]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>전체 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">구입 금액</div>
              <div className="text-xl font-semibold">
                {numberToKorean(totals.totalPurchaseValue)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">현재 가치</div>
              <div className="text-xl font-semibold">
                {numberToKorean(totals.totalCurrentValue)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">평가손익</div>
              <div className={`text-xl font-semibold ${getProfitColorClass(totals.totalProfit)}`}>
                {formatProfitKorean(totals.totalProfit)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">수익률</div>
              <div
                className={`text-xl font-semibold ${getProfitColorClass(totals.totalReturnRate)}`}
              >
                {formatReturnRate(totals.totalReturnRate)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>자산 유형별 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(totals.byType).map(([type, data]) => {
              const profit = data.currentValue - data.purchaseValue;
              const returnRate = calculateReturnRate(data.currentValue, data.purchaseValue);
              return (
                <div
                  key={type}
                  className="flex justify-between items-center p-3 bg-muted rounded-lg"
                >
                  <div>
                    <div className="font-medium">{type}</div>
                    <div className="text-sm text-muted-foreground">{data.count}개</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{numberToKorean(data.currentValue)}</div>
                    <div className={`text-sm ${getProfitColorClass(profit)}`}>
                      {formatProfitKorean(profit)} ({formatReturnRate(returnRate)})
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>소유자별 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(totals.byOwner).map(([owner, data]) => {
              const profit = data.currentValue - data.purchaseValue;
              const returnRate = calculateReturnRate(data.currentValue, data.purchaseValue);
              return (
                <div
                  key={owner}
                  className="flex justify-between items-center p-3 bg-muted rounded-lg"
                >
                  <div>
                    <div className="font-medium">{owner}</div>
                    <div className="text-sm text-muted-foreground">{data.count}개</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{numberToKorean(data.currentValue)}</div>
                    <div className={`text-sm ${getProfitColorClass(profit)}`}>
                      {formatProfitKorean(profit)} ({formatReturnRate(returnRate)})
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
