"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { ChartContainer, ChartTooltip } from "@web/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useLoansStore } from "@web/features/loans/stores/loans-store";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { numberToKorean } from "@web/utils/number-format";
import { ChevronRight } from "lucide-react";
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
        fill: "#3b82f6", // blue-500
      });
    }

    if (assetTotals.savings > 0) {
      data.push({
        name: "저축",
        value: assetTotals.savings,
        fill: "#10b981", // green-500
      });
    }

    if (assetTotals.realAssets > 0) {
      data.push({
        name: "실물자산",
        value: assetTotals.realAssets,
        fill: "#f59e0b", // amber-500
      });
    }

    if (assetTotals.loans > 0) {
      data.push({
        name: "부채",
        value: assetTotals.loans,
        fill: "#ef4444", // red-500
      });
    }

    return data;
  }, [assetTotals]);

  const chartConfig = {
    투자: {
      label: "투자",
      color: "#3b82f6",
    },
    저축: {
      label: "저축",
      color: "#10b981",
    },
    실물자산: {
      label: "실물자산",
      color: "#f59e0b",
    },
    부채: {
      label: "부채",
      color: "#ef4444",
    },
  };

  const hasAnyAssets = chartData.length > 0;

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-6xl">
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
                      content={({ active, payload }) => {
                        if (active && payload && payload.length && payload[0]) {
                          const data = payload[0].payload as AssetData;
                          return (
                            <div className="rounded-lg border bg-background p-3 shadow-md">
                              <div className="flex items-center gap-2 mb-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: data.fill }}
                                />
                                <span className="font-semibold">{data.name}</span>
                              </div>
                              <div className="text-lg font-bold">
                                {numberToKorean(data.value.toString())}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
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

            <Card>
              <CardHeader>
                <CardTitle>자산 상세</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="investments" className="w-full">
                  <div className="w-full overflow-x-auto">
                    <TabsList className="inline-flex w-auto min-w-full h-full">
                      <TabsTrigger value="investments" className="flex-1 min-w-[120px] py-2">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-lg font-bold">
                            {numberToKorean(assetTotals.investment.toString())}
                          </span>
                          <span>투자</span>
                        </div>
                      </TabsTrigger>
                      <TabsTrigger value="savings" className="flex-1 min-w-[120px] py-2">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-lg font-bold">
                            {numberToKorean(assetTotals.savings.toString())}
                          </span>
                          <span>저축</span>
                        </div>
                      </TabsTrigger>
                      <TabsTrigger value="realAssets" className="flex-1 min-w-[120px] py-2">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-lg font-bold">
                            {numberToKorean(assetTotals.realAssets.toString())}
                          </span>
                          <span>실물자산</span>
                        </div>
                      </TabsTrigger>
                      <TabsTrigger value="loans" className="flex-1 min-w-[120px] py-2">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-lg font-bold">
                            {numberToKorean(assetTotals.loans.toString())}
                          </span>
                          <span>부채</span>
                        </div>
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="investments" className="mt-4">
                    <div className="flex justify-end mb-3">
                      <Link
                        href="/assets/investments"
                        className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        상세 보기
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Link>
                    </div>
                    <div className="space-y-3">
                      {investments.length === 0 ? (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                          투자 계좌가 없습니다.
                        </p>
                      ) : (
                        investments.map((investment) => (
                          <div
                            key={investment.id}
                            className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                          >
                            <div>
                              <h4 className="font-medium">{investment.accountName}</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {investment.accountType} · {investment.accountOwner}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">
                                {numberToKorean((investment.currentValue ?? 0).toString())}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="savings" className="mt-4">
                    <div className="flex justify-end mb-3">
                      <Link
                        href="/assets/savings"
                        className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        상세 보기
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Link>
                    </div>
                    <div className="space-y-3">
                      {savings.length === 0 ? (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                          저축 계좌가 없습니다.
                        </p>
                      ) : (
                        savings.map((saving) => (
                          <div
                            key={saving.id}
                            className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                          >
                            <div>
                              <h4 className="font-medium">{saving.accountName}</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {saving.accountType} · {saving.accountOwner}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">
                                {numberToKorean((saving.balance ?? 0).toString())}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="realAssets" className="mt-4">
                    <div className="flex justify-end mb-3">
                      <Link
                        href="/assets/real-assets"
                        className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        상세 보기
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Link>
                    </div>
                    <div className="space-y-3">
                      {realAssets.length === 0 ? (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                          실물자산이 없습니다.
                        </p>
                      ) : (
                        realAssets.map((asset) => (
                          <div
                            key={asset.id}
                            className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                          >
                            <div>
                              <h4 className="font-medium">{asset.assetName}</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {asset.assetType}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">
                                {numberToKorean((asset.currentValue ?? 0).toString())}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="loans" className="mt-4">
                    <div className="flex justify-end mb-3">
                      <Link
                        href="/assets/loans"
                        className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        상세 보기
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Link>
                    </div>
                    <div className="space-y-3">
                      {loans.length === 0 ? (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                          부채가 없습니다.
                        </p>
                      ) : (
                        loans.map((loan) => (
                          <div
                            key={loan.id}
                            className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                          >
                            <div>
                              <h4 className="font-medium">{loan.loanName}</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {loan.loanType} · {loan.lender}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">
                                {numberToKorean((loan.amount ?? 0).toString())}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
