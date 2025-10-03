"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InvestmentAreaChart } from "@web/components/investment-area-chart";
import { InvestmentPlanComparisonChart } from "@web/components/investment-plan-comparison-chart";
import { Button } from "@web/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { useAssetPlanStore } from "@web/features/asset-plan/stores/asset-plan-store";
import { AssetPlan } from "@web/features/asset-plan/types/types";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { InvestmentItem } from "@web/features/investments/types/types";
import { numberToKorean } from "@web/utils/number-format";
import { ChevronRight, Landmark } from "lucide-react";
import { L } from "vitest/dist/chunks/reporters.d.BFLkQcL6.js";

export default function AssetsPage() {
  const investments = useInvestmentStore((state) => state.investments);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  if (!isLoaded) return <LoadingView />;

  const hasInvestments = investments.some((item) => item.currentValue > 0);
  if (!hasInvestments) return <EmptyInvestmentsView />;

  return <InvestmentDashboardView investments={investments} />;
}

function LoadingView() {
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

function EmptyInvestmentsView() {
  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold mb-4">투자 자산 현황</h1>
          <p className="text-gray-600 dark:text-gray-400">
            투자 계좌를 추가하여 자산 현황을 관리해보세요
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 max-w-md mx-auto">
          <InvestmentCard />
        </div>

        <ActionsBar />
      </div>
    </main>
  );
}

function ActionsBar() {
  return (
    <div className="flex flex-wrap justify-center gap-4">
      <Button asChild size={"lg"}>
        <Link href="/asset-plan">자산계획 세우기</Link>
      </Button>
      <Button variant={"secondary"} asChild size={"lg"}>
        <Link href="/asset-plan-list">자산계획 목록 보기</Link>
      </Button>
    </div>
  );
}

interface InvestmentDashboardViewProps {
  investments: InvestmentItem[];
}

function InvestmentDashboardView({ investments }: InvestmentDashboardViewProps) {
  const validInvestments = investments.filter((item) => item.currentValue > 0);
  const plans = useAssetPlanStore((state) => state.plans);

  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [showComparison, setShowComparison] = useState(false);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const totalInvestments = validInvestments.reduce((s, i) => s + i.currentValue, 0);

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl flex flex-col gap-8">
        <Header title="투자 자산 현황" />

        <div className="bg-green-100 dark:bg-green-900/30 rounded-xl p-6">
          <SummaryCard
            validInvestments={validInvestments}
            plans={plans}
            selectedPlanId={selectedPlanId}
            setSelectedPlanId={setSelectedPlanId}
            showComparison={showComparison}
            setShowComparison={setShowComparison}
            totalInvestments={totalInvestments}
            selectedPlan={selectedPlan}
          />
          <ChartArea
            validInvestments={validInvestments}
            showComparison={showComparison}
            selectedPlan={selectedPlan}
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">투자 계좌 목록</h3>
          <InvestmentList investments={validInvestments} />
        </div>

        <ActionsBar />
      </div>
    </main>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="mb-10">
      <h1 className="text-3xl font-bold mb-4">{title}</h1>
    </div>
  );
}

interface SummaryCardProps {
  validInvestments: InvestmentItem[];
  plans: AssetPlan[];
  selectedPlanId: string;
  setSelectedPlanId: (v: string) => void;
  showComparison: boolean;
  setShowComparison: (v: boolean) => void;
  totalInvestments: number;
  selectedPlan?: AssetPlan | undefined;
}

function SummaryCard({
  validInvestments,
  plans,
  selectedPlanId,
  setSelectedPlanId,
  showComparison,
  setShowComparison,
  totalInvestments,
  selectedPlan,
}: SummaryCardProps) {
  return (
    <>
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white rounded-lg dark:bg-gray-800">
            <InvestmentIcon />
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-1">투자</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {validInvestments.length}개 계좌
            </p>
          </div>
        </div>
        <Link href="/assets/investments">
          <div className="flex items-center text-blue-600 dark:text-blue-400 hover:underline">
            <span className="font-medium mr-1">관리</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </Link>
      </div>

      <div className="mb-6">
        <p className="text-gray-600 dark:text-gray-400 mb-2">총 투자 금액</p>
        <p className="text-3xl font-bold">{numberToKorean(totalInvestments.toString())}</p>
      </div>

      {/* 계획 선택 및 차트 토글 */}
      {plans.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              계획과 비교:
            </label>
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="자산계획 선택" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.planName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPlan && (
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {showComparison ? "기본 차트 보기" : "비교 차트 보기"}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function ChartArea({
  validInvestments,
  showComparison,
  selectedPlan,
}: {
  validInvestments: InvestmentItem[];
  showComparison: boolean;
  selectedPlan?: AssetPlan | undefined;
}) {
  return (
    <div className="w-full">
      {showComparison && selectedPlan ? (
        <InvestmentPlanComparisonChart investments={validInvestments} selectedPlan={selectedPlan} />
      ) : (
        <InvestmentAreaChart investments={validInvestments} />
      )}
    </div>
  );
}

function InvestmentList({ investments }: { investments: InvestmentItem[] }) {
  return (
    <div className="space-y-3">
      {investments.map((investment) => (
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
            <p className="font-semibold">{numberToKorean(investment.currentValue.toString())}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {investment.records.length}개 기록
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function InvestmentCard() {
  return (
    <Link href="/assets/investments" className="block">
      <div className="bg-green-100 dark:bg-green-900/30 rounded-xl p-6 transition-all hover:shadow-md dark:hover:shadow-gray-800/30">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white rounded-lg dark:bg-gray-800">
            <InvestmentIcon />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-2">투자</h2>
            <p className="text-gray-600 dark:text-gray-400">주식, 채권, 펀드, 가상자산 등</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function InvestmentIcon() {
  return <Landmark className="w-6 h-6" />;
}
