"use client";

import { useMemo, useState } from "react";
import { SavingsStackedAreaChart } from "@web/app/(app)/assets/savings/_components/savings-stacked-area-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { prepareMonthlySavingsSummary } from "@web/features/savings/utils/monthly-summary-utils";
import { numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean, getProfitColorClass } from "@web/utils/profit-color";

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

  // 연도별로 데이터 그룹화
  const dataByYear = useMemo(() => {
    const grouped = new Map<string, typeof monthlyData>();

    monthlyData.forEach((row) => {
      const year = row.yearMonth.split("-")[0]!;
      if (!grouped.has(year)) {
        grouped.set(year, []);
      }
      grouped.get(year)!.push(row);
    });

    // 연도를 내림차순으로 정렬
    return new Map([...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0])));
  }, [monthlyData]);

  const years = Array.from(dataByYear.keys());
  const defaultYear = years[0] || "";
  const [selectedYear, setSelectedYear] = useState(defaultYear);

  // 연도가 변경되면 기본값 업데이트
  useMemo(() => {
    if (defaultYear && !selectedYear) {
      setSelectedYear(defaultYear);
    }
  }, [defaultYear, selectedYear]);

  return (
    <div className="space-y-4">
      {/* 저축 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>저축 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <SavingsStackedAreaChart savings={savings} />
        </CardContent>
      </Card>

      {/* 총계 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>전체 저축 요약</CardTitle>
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
                <div className="text-2xl font-bold">{numberToKorean(totalBalance)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 월별 내역 */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>월별 저축 내역</CardTitle>
          </CardHeader>
          <CardContent>
            {years.length > 0 && (
              <Tabs value={selectedYear} onValueChange={setSelectedYear}>
                <TabsList>
                  {years.map((year) => (
                    <TabsTrigger key={year} value={year} className="text-sm">
                      {year}년
                    </TabsTrigger>
                  ))}
                </TabsList>

                {years.map((year) => {
                  const yearData = dataByYear.get(year) || [];
                  return (
                    <TabsContent key={year} value={year} className="mt-4">
                      <div className="space-y-2">
                        {yearData.map((row) => {
                          return (
                            <div
                              key={row.yearMonth}
                              className="flex justify-between items-center py-2 border-b last:border-0"
                            >
                              <span className="font-medium">{row.displayMonth}</span>
                              <div className="text-right">
                                <div className="font-semibold">{numberToKorean(row.balance)}</div>
                                {row.hasChange && (
                                  <div
                                    className={`text-xs ${getProfitColorClass(row.change)} flex items-center justify-end gap-1`}
                                  >
                                    <span>{formatProfitKorean(row.change)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
