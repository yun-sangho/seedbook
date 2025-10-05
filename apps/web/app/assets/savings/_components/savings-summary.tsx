"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { prepareMonthlySavingsSummary } from "@web/features/savings/utils/monthly-summary-utils";
import { numberToKorean } from "@web/utils/number-format";

export function SavingsSummary() {
  const savings = useSavingsStore((state) => state.savings);

  // 총 잔액 계산
  const totalBalance = useMemo(() => {
    return savings.reduce((sum, item) => sum + (item.balance || 0), 0);
  }, [savings]);

  // 월별 요약 데이터
  const monthlyData = useMemo(() => {
    return prepareMonthlySavingsSummary(savings);
  }, [savings]);

  return (
    <div className="space-y-6">
      {/* 총계 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>전체 예금 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">총 계좌 수</span>
              <span className="text-lg font-semibold">{savings.length}개</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">총 잔액</span>
              <div className="text-right">
                <div className="text-2xl font-bold">{totalBalance.toLocaleString()}만원</div>
                <div className="text-sm text-muted-foreground">{numberToKorean(totalBalance)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 월별 내역 */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>월별 예금 내역</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {monthlyData.slice(0, 12).map((row) => (
                <div
                  key={row.yearMonth}
                  className="flex justify-between items-center py-2 border-b last:border-0"
                >
                  <span className="font-medium">{row.displayMonth}</span>
                  <div className="text-right">
                    <div className="font-semibold">{row.balance.toLocaleString()}만원</div>
                    <div className="text-sm text-muted-foreground">
                      {numberToKorean(row.balance)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
