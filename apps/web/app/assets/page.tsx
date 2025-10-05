"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useLoansStore } from "@web/features/loans/stores/loans-store";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { numberToKorean } from "@web/utils/number-format";
import { Cell, Label, Pie, PieChart } from "recharts";

type AssetType = "투자" | "저축" | "실물자산" | "부채";

interface AssetData {
  name: AssetType;
  value: number;
  fill: string;
}

export default function AssetsOverviewPage() {
  const investments = useInvestmentStore((state) => state.investments);
  const savings = useSavingsStore((state) => state.savings);
  const loans = useLoansStore((state) => state.loans);
  const realAssets = useRealAssetsStore((state) => state.realAssets);

  const assetTotals = useMemo(() => {
    const investmentTotal = investments.reduce((sum, item) => sum + (item.currentValue ?? 0), 0);
    const savingsTotal = savings.reduce((sum, item) => sum + (item.balance ?? 0), 0);
    const realAssetsTotal = realAssets.reduce((sum, item) => sum + (item.currentValue ?? 0), 0);
    const loanTotal = loans.reduce((sum, item) => sum + (item.amount ?? 0), 0);

    return {
      investment: investmentTotal,
      savings: savingsTotal,
      realAssets: realAssetsTotal,
      loans: loanTotal,
    };
  }, [investments, savings, realAssets, loans]);

  const netAssets = useMemo(() => {
    return (
      assetTotals.investment + assetTotals.savings + assetTotals.realAssets - assetTotals.loans
    );
  }, [assetTotals]);

  const chartData: AssetData[] = useMemo(() => {
    const data: AssetData[] = [];

    if (assetTotals.investment > 0) {
      data.push({
        name: "투자",
        value: assetTotals.investment,
        fill: "hsl(var(--chart-1))",
      });
    }

    if (assetTotals.savings > 0) {
      data.push({
        name: "저축",
        value: assetTotals.savings,
        fill: "hsl(var(--chart-2))",
      });
    }

    if (assetTotals.realAssets > 0) {
      data.push({
        name: "실물자산",
        value: assetTotals.realAssets,
        fill: "hsl(var(--chart-3))",
      });
    }

    if (assetTotals.loans > 0) {
      data.push({
        name: "부채",
        value: assetTotals.loans,
        fill: "hsl(var(--chart-4))",
      });
    }

    return data;
  }, [assetTotals]);

  const chartConfig = {
    투자: {
      label: "투자",
      color: "hsl(var(--chart-1))",
    },
    저축: {
      label: "저축",
      color: "hsl(var(--chart-2))",
    },
    실물자산: {
      label: "실물자산",
      color: "hsl(var(--chart-3))",
    },
    부채: {
      label: "부채",
      color: "hsl(var(--chart-4))",
    },
  };

  const hasAnyAssets = chartData.length > 0;

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-6xl">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold mb-4">전체 자산 현황</h1>
          <p className="text-gray-600 dark:text-gray-400">모든 자산을 한눈에 확인하세요.</p>
        </div>

        {!hasAnyAssets ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-gray-500 dark:text-gray-400">
                아직 등록된 자산이 없습니다.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>자산 구성</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={chartConfig}
                  className="mx-auto aspect-square max-h-[400px]"
                >
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          hideLabel
                          formatter={(value) => numberToKorean(value.toString())}
                        />
                      }
                    />
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={80}
                      outerRadius={120}
                      strokeWidth={2}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                      <Label
                        content={({ viewBox }) => {
                          if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                            return (
                              <text
                                x={viewBox.cx}
                                y={viewBox.cy}
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                <tspan
                                  x={viewBox.cx}
                                  y={(viewBox.cy ?? 0) - 10}
                                  className="fill-foreground text-sm font-medium"
                                >
                                  순자산
                                </tspan>
                                <tspan
                                  x={viewBox.cx}
                                  y={(viewBox.cy ?? 0) + 15}
                                  className="fill-foreground text-2xl font-bold"
                                >
                                  {numberToKorean(netAssets.toString())}
                                </tspan>
                              </text>
                            );
                          }
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">투자</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {numberToKorean(assetTotals.investment.toString())}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {investments.length}개 계좌
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">저축</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {numberToKorean(assetTotals.savings.toString())}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {savings.length}개 계좌
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">실물자산</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {numberToKorean(assetTotals.realAssets.toString())}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {realAssets.length}개 자산
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">부채</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {numberToKorean(assetTotals.loans.toString())}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {loans.length}개 대출
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
