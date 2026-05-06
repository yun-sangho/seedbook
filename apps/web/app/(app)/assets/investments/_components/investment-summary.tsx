"use client";

import { useMemo } from "react";
import { InvestmentStackedAreaChart } from "@web/app/(app)/assets/investments/_components/investment-stacked-area-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { InvestmentItem } from "@web/features/investments/types/types";
import { prepareMonthlyInvestmentSummary } from "@web/utils/monthly-summary-utils";
import { calculateReturnRate, formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean, getProfitColorClass } from "@web/utils/profit-color";
import { columns } from "./monthly-summary-columns";
import { DataTable } from "./monthly-summary-data-table";

interface InvestmentSummaryProps {
  investments: InvestmentItem[];
}

export function InvestmentSummary({ investments }: InvestmentSummaryProps) {
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

  const monthlyData = useMemo(() => prepareMonthlyInvestmentSummary(investments), [investments]);

  return (
    <div className="space-y-4">
      {/* 투자 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>투자 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <InvestmentStackedAreaChart investments={investments} />
        </CardContent>
      </Card>

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
              <div className="text-xl font-semibold">
                {numberToKorean(totals.totalCurrentValue)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">수익금</div>
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
          <CardTitle>월별 투자 내역</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={monthlyData} />
        </CardContent>
      </Card>
    </div>
  );
}
