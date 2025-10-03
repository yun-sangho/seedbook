"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { InvestmentItem } from "@web/features/investments/types/types";
import { calculateReturnRate, formatReturnRate, numberToKorean } from "@web/utils/number-format";

interface InvestmentSummaryProps {
  investments: InvestmentItem[];
}

export function InvestmentSummary({ investments }: InvestmentSummaryProps) {
  // 총계 계산
  const totals = useMemo(() => {
    const totalInitialInvestment = investments.reduce(
      (sum, inv) => sum + (inv.initialInvestment || 0),
      0
    );
    const totalCurrentValue = investments.reduce((sum, inv) => sum + (inv.currentValue || 0), 0);
    const totalProfit = totalCurrentValue - totalInitialInvestment;
    const totalReturnRate = calculateReturnRate(totalCurrentValue, totalInitialInvestment);

    return {
      totalInitialInvestment,
      totalCurrentValue,
      totalProfit,
      totalReturnRate,
    };
  }, [investments]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>총 계좌 요약</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground mb-1">투자원금</div>
            <div className="text-xl font-semibold">
              {numberToKorean(totals.totalInitialInvestment)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">평가금액</div>
            <div className="text-xl font-semibold">{numberToKorean(totals.totalCurrentValue)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">수익금</div>
            <div
              className={`text-xl font-semibold ${
                totals.totalProfit >= 0 ? "text-blue-600" : "text-red-600"
              }`}
            >
              {totals.totalProfit >= 0 ? "+" : ""}
              {numberToKorean(totals.totalProfit)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">수익률</div>
            <div
              className={`text-xl font-semibold ${
                totals.totalReturnRate >= 0 ? "text-blue-600" : "text-red-600"
              }`}
            >
              {formatReturnRate(totals.totalReturnRate)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
