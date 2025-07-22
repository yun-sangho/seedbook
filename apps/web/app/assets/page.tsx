"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InvestmentAreaChart } from "@web/components/investment-area-chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart";
import { prepareAssetsChartData } from "@web/features/assets/utils/chart-utils";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { InvestmentItem } from "@web/features/investments/types/types";
import { useLoansStore } from "@web/features/loans/stores/loans-store";
import { LoanItem } from "@web/features/loans/types/types";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { RealAssetItem } from "@web/features/real-assets/types/types";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { SavingsItem } from "@web/features/savings/types/types";
import { numberToKorean } from "@web/utils/number-format";
import { BadgeDollarSign, ChevronRight, Droplets, Home, Landmark } from "lucide-react";
import { Cell, Label, Pie, PieChart } from "recharts";

export default function AssetsPage() {
  // 자산 데이터 로드
  const savings = useSavingsStore((state) => state.savings);
  const investments = useInvestmentStore((state) => state.investments);
  const realAssets = useRealAssetsStore((state) => state.realAssets);
  const loans = useLoansStore((state) => state.loans);

  // 클라이언트 사이드 렌더링을 위한 상태
  const [isLoaded, setIsLoaded] = useState(false);

  // 자산 존재 여부 확인
  const hasAssets = () => {
    const validSavings = savings.some((item) => item.amount > 0);
    const validInvestments = investments.some((item) => item.currentValue > 0);
    const validRealAssets = realAssets.some((item) => item.currentValue > 0);
    const validLoans = loans.some((item) => item.amount > 0);
    return validSavings || validInvestments || validRealAssets || validLoans;
  };

  // 클라이언트 사이드에서만 실행되도록 useEffect 사용
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // 로딩 중에는 비어있는 화면 표시
  if (!isLoaded) {
    return (
      <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
        <div className="w-full max-w-4xl">
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-bold mb-4">로딩 중...</h1>
          </div>
        </div>
      </main>
    );
  }

  // 자산이 있는 경우 자산 대시보드 표시
  if (hasAssets()) {
    return (
      <AssetDashboardView
        savings={savings}
        investments={investments}
        realAssets={realAssets}
        loans={loans}
      />
    );
  }

  // 자산이 없는 경우 자산 입력 페이지 표시
  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold mb-4">자산 현황 입력</h1>
          <p className="text-gray-600 dark:text-gray-400">
            아래 항목을 선택하여 현재 자산 상태를 입력해주세요
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AssetCard
            title="저축"
            description="예금, 적금, 현금 등"
            color="bg-blue-100 dark:bg-blue-900/30"
            href="/assets/savings"
            icon={<SavingsIcon />}
          />

          <AssetCard
            title="투자"
            description="주식, 채권, 펀드, 가상자산 등"
            color="bg-green-100 dark:bg-green-900/30"
            href="/assets/investments"
            icon={<InvestmentIcon />}
          />

          <AssetCard
            title="실물자산"
            description="부동산, 자동차, 귀금속 등"
            color="bg-amber-100 dark:bg-amber-900/30"
            href="/assets/real-assets"
            icon={<RealAssetsIcon />}
          />

          <AssetCard
            title="대출"
            description="주택담보대출, 신용대출, 카드대출 등"
            color="bg-red-100 dark:bg-red-900/30"
            href="/assets/loans"
            icon={<LoansIcon />}
          />
        </div>

        <div className="flex justify-center mt-10">
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
          >
            자산 대시보드 보기
          </Link>
        </div>
      </div>
    </main>
  );
}

// 자산 대시보드 컴포넌트
interface AssetDashboardViewProps {
  savings: SavingsItem[];
  investments: InvestmentItem[];
  realAssets: RealAssetItem[];
  loans: LoanItem[];
}

function AssetDashboardView({ savings, investments, realAssets, loans }: AssetDashboardViewProps) {
  // 자산별 유효 항목만 필터링
  const validSavings = savings.filter((item) => item.amount > 0);
  const validInvestments = investments.filter((item) => item.currentValue > 0);
  const validRealAssets = realAssets.filter((item) => item.currentValue > 0);
  const validLoans = loans.filter((item) => item.amount > 0);

  // 각 자산 유형별 총액 계산
  const totalSavings = validSavings.reduce((sum, item) => sum + item.amount, 0);
  const totalInvestments = validInvestments.reduce((sum, item) => sum + item.currentValue, 0);
  const totalRealAssets = validRealAssets.reduce((sum, item) => sum + item.currentValue, 0);
  const totalLoans = validLoans.reduce((sum, item) => sum + item.amount, 0);

  // 총 자산 및 순자산 계산
  const totalAssets = totalSavings + totalInvestments + totalRealAssets;
  const netAssets = totalAssets - totalLoans; // 순자산 = 총 자산 - 총 부채

  // 차트 데이터 준비
  const assetsChartData = prepareAssetsChartData(savings, investments, realAssets, loans);

  // 데이터가 있는 자산 유형만 필터링
  const activeAssets = assetsChartData.filter((asset) => asset.amount > 0);

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-4">자산 현황</h1>

          {/* 총 자산 도넛 차트 섹션 */}
          <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl mb-8">
            <div className="flex flex-col items-center mb-6">
              <h2 className="text-xl font-semibold mb-4">자산 구성</h2>
              <div className="flex justify-center w-full h-100">
                <ChartContainer
                  config={activeAssets.reduce(
                    (acc, asset) => {
                      acc[asset.name] = { color: asset.color };
                      return acc;
                    },
                    {} as Record<string, { color: string }>
                  )}
                  className="aspect-square h-full"
                >
                  <PieChart>
                    <Pie
                      data={activeAssets}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={100}
                      strokeWidth={5}
                    >
                      {activeAssets.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
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
                                  y={viewBox.cy}
                                  className="fill-foreground text-2xl font-bold"
                                >
                                  {numberToKorean(netAssets.toString())}
                                </tspan>
                                <tspan
                                  x={viewBox.cx}
                                  y={(viewBox.cy || 0) + 24}
                                  className="fill-muted-foreground"
                                >
                                  순자산
                                </tspan>
                              </text>
                            );
                          }
                        }}
                      />
                    </Pie>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => numberToKorean(value.toString())}
                        />
                      }
                    />
                  </PieChart>
                </ChartContainer>
              </div>

              {/* 자산 요약 정보 */}
              <div className="flex justify-between w-full max-w-lg mt-6 mb-2">
                <div className="text-center">
                  <span className="text-sm text-gray-500">총 자산</span>
                  <p className="font-bold">{numberToKorean(totalAssets.toString())}</p>
                </div>
                {totalLoans > 0 && (
                  <div className="text-center">
                    <span className="text-sm text-gray-500">총 부채</span>
                    <p className="font-bold text-red-500">
                      {numberToKorean(totalLoans.toString())}
                    </p>
                  </div>
                )}
                <div className="text-center">
                  <span className="text-sm text-gray-500">순자산</span>
                  <p className="font-bold">{numberToKorean(netAssets.toString())}</p>
                </div>
              </div>

              {/* 차트 범례 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 w-full max-w-lg">
                {activeAssets.map((asset, index) => (
                  <div key={`legend-${index}`} className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: asset.color }}
                    />
                    <div className="flex flex-col">
                      <span className="text-xs">{asset.name}</span>
                      <span className="text-xs font-semibold">
                        {((asset.amount / totalAssets) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 자산 유형별 카드 섹션 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 저축 섹션 */}
            <AssetTypeCard
              title="저축"
              amount={totalSavings}
              color="bg-blue-100 dark:bg-blue-900/30"
              href="/assets/savings"
              icon={<SavingsIcon />}
              itemCount={validSavings.length}
              chartData={assetsChartData[0]?.items || []}
            />

            {/* 투자 섹션 */}
            <AssetTypeCard
              title="투자"
              amount={totalInvestments}
              color="bg-green-100 dark:bg-green-900/30"
              href="/assets/investments"
              icon={<InvestmentIcon />}
              itemCount={validInvestments.length}
              chartData={assetsChartData[1]?.items || []}
              investments={validInvestments}
            />

            {/* 실물자산 섹션 */}
            <AssetTypeCard
              title="실물자산"
              amount={totalRealAssets}
              color="bg-amber-100 dark:bg-amber-900/30"
              href="/assets/real-assets"
              icon={<RealAssetsIcon />}
              itemCount={validRealAssets.length}
              chartData={assetsChartData[2]?.items || []}
            />

            {/* 대출 섹션 */}
            <AssetTypeCard
              title="대출"
              amount={totalLoans}
              color="bg-red-100 dark:bg-red-900/30"
              href="/assets/loans"
              icon={<LoansIcon />}
              itemCount={validLoans.length}
              chartData={assetsChartData[3]?.items || []}
            />
          </div>
        </div>

        <div className="flex justify-center mt-10">
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
          >
            상세 대시보드 보기
          </Link>
        </div>
      </div>
    </main>
  );
}

// 자산 유형 카드 컴포넌트
interface AssetTypeCardProps {
  title: string;
  amount: number;
  color: string;
  href: string;
  icon: React.ReactNode;
  itemCount: number;
  chartData: { name: string; amount: number; color: string }[];
  investments?: InvestmentItem[]; // 투자 섹션에만 사용
}

function AssetTypeCard({
  title,
  amount,
  color,
  href,
  icon,
  itemCount,
  chartData,
  investments,
}: AssetTypeCardProps) {
  const isInvestmentCard = title === "투자";

  return (
    <div
      className={`rounded-xl p-6 transition-all hover:shadow-md dark:hover:shadow-gray-800/30 ${color}`}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white rounded-lg dark:bg-gray-800">{icon}</div>
          <div>
            <h2 className="text-xl font-semibold mb-1">{title}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{itemCount}개 항목</p>
          </div>
        </div>
        <Link href={href}>
          <div className="flex items-center text-blue-600 dark:text-blue-400 hover:underline">
            <span className="font-medium mr-1">관리</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </Link>
      </div>

      <div className="mt-4 flex flex-col md:flex-row items-center justify-between">
        <div>
          <p className="text-gray-600 dark:text-gray-400 mb-1">총 금액</p>
          <p className="text-xl font-bold">{numberToKorean(amount.toString())}</p>
        </div>

        {/* 투자 섹션에는 Area 차트, 다른 섹션에는 도넛 차트 */}
        <div className="mt-4 md:mt-0">
          {isInvestmentCard && investments ? (
            <div className="w-full md:w-[300px]">
              <InvestmentAreaChart investments={investments} />
            </div>
          ) : amount > 0 ? (
            <div className="w-[110px] h-[110px]">
              <ChartContainer
                config={chartData.reduce(
                  (acc, item) => {
                    acc[item.name] = { color: item.color };
                    return acc;
                  },
                  {} as Record<string, { color: string }>
                )}
                className="aspect-square h-full"
              >
                <PieChart>
                  <Pie data={chartData} dataKey="amount" nameKey="name" innerRadius={25}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => numberToKorean(value.toString())}
                      />
                    }
                  />
                </PieChart>
              </ChartContainer>
            </div>
          ) : (
            <div className="w-[110px] h-[110px] flex items-center justify-center rounded-full border-4 border-dashed border-gray-200">
              <span className="text-gray-400 text-sm">데이터 없음</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 자산 카드 컴포넌트
interface AssetCardProps {
  title: string;
  description: string;
  color: string;
  href: string;
  icon: React.ReactNode;
}

function AssetCard({ title, description, color, href, icon }: AssetCardProps) {
  return (
    <Link href={href} className="block">
      <div
        className={`rounded-xl p-6 transition-all hover:shadow-md dark:hover:shadow-gray-800/30 ${color}`}
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white rounded-lg dark:bg-gray-800">{icon}</div>
          <div>
            <h2 className="text-xl font-semibold mb-2">{title}</h2>
            <p className="text-gray-600 dark:text-gray-400">{description}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SavingsIcon() {
  return <Droplets className="w-6 h-6" />;
}

function InvestmentIcon() {
  return <Landmark className="w-6 h-6" />;
}

function RealAssetsIcon() {
  return <Home className="w-6 h-6" />;
}

function LoansIcon() {
  return <BadgeDollarSign className="w-6 h-6" />;
}
