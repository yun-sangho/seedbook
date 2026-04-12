"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@web/components/ui/button";
import { useAssetPlanStore } from "@web/features/asset-plan/stores/asset-plan-store";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { preparePlanComparisonChartData } from "@web/utils/plan-comparison-utils";
import { TrendingUp } from "lucide-react";
import { AccountPlansSection } from "./_components/account-plans-section";
import { PlanBasicInfoSection } from "./_components/plan-basic-info-section";
import { PlanHeader } from "./_components/plan-header";
import { PlanIntro } from "./_components/plan-intro";
import { PlanPreviewChartSection } from "./_components/plan-preview-chart-section";
import { PlanSummarySection } from "./_components/plan-summary-section";

export default function AssetPlanPage() {
  const router = useRouter();
  const investments = useInvestmentStore((state) => state.investments);
  const addPlan = useAssetPlanStore((state) => state.addPlan);
  const validInvestments = investments.filter((item) => item.currentValue > 0);

  // 폼 상태 관리
  const [planName, setPlanName] = useState("");
  const [planPeriod, setPlanPeriod] = useState("30"); // 계획 기간 (년)
  const [accountPlans, setAccountPlans] = useState<{
    [accountId: string]: {
      contributionAmount: string; // 원 단위
      contributionFrequency: string; // 월/분기/반기/년
      targetAnnualReturn: string;
      accountKind: "investment" | "savings";
    };
  }>({});

  // 계좌별 계획 설정 업데이트
  const updateAccountPlan = (accountId: string, field: string, value: string) => {
    setAccountPlans((prev) => ({
      ...prev,
      [accountId]: {
        contributionAmount: prev[accountId]?.contributionAmount || "",
        contributionFrequency: prev[accountId]?.contributionFrequency || "월",
        targetAnnualReturn: prev[accountId]?.targetAnnualReturn || "",
        accountKind: prev[accountId]?.accountKind || "investment",
        [field]: value,
      },
    }));
  };

  // 폼 유효성 검사
  const isFormValid = () => {
    if (!planName.trim()) return false;
    if (!planPeriod || parseInt(planPeriod) < 1 || parseInt(planPeriod) > 50) return false;

    // 모든 계좌에 대해 납입금과 목표 수익률이 설정되었는지 확인
    return validInvestments.every((investment) => {
      const plan = accountPlans[investment.id];
      return (
        plan &&
        plan.contributionAmount &&
        parseFloat(plan.contributionAmount.replace(/,/g, "")) >= 0 &&
        plan.contributionFrequency &&
        plan.targetAnnualReturn &&
        parseFloat(plan.targetAnnualReturn) >= 0
      );
    });
  };

  // 월 환산 납입금 계산 헬퍼 함수 (원 단위)
  const getMonthlyContribution = (amount: string, frequency: string): number => {
    const numericAmount = parseFloat(amount.replace(/,/g, "")); // 원 단위
    if (isNaN(numericAmount)) return 0;

    switch (frequency) {
      case "월":
        return numericAmount;
      case "분기":
        return numericAmount / 3;
      case "반기":
        return numericAmount / 6;
      case "년":
        return numericAmount / 12;
      default:
        return 0;
    }
  };

  // 총 월 납입금 계산
  const totalMonthlyContribution = Object.entries(accountPlans).reduce((sum, [, plan]) => {
    return (
      sum +
      getMonthlyContribution(plan?.contributionAmount || "0", plan?.contributionFrequency || "월")
    );
  }, 0);

  // 평균 목표 수익률 계산 (자산 가중평균)
  const averageTargetReturn = (() => {
    let totalCurrentValue = 0;
    let weightedReturnSum = 0;

    validInvestments.forEach((investment) => {
      const plan = accountPlans[investment.id];
      const targetReturn = parseFloat(plan?.targetAnnualReturn || "0");
      if (!isNaN(targetReturn)) {
        totalCurrentValue += investment.currentValue;
        weightedReturnSum += investment.currentValue * targetReturn;
      }
    });

    return totalCurrentValue > 0 ? weightedReturnSum / totalCurrentValue : 0;
  })();

  // 실시간 차트 데이터 생성
  const previewChartData = useMemo(() => {
    if (validInvestments.length === 0 || !planPeriod || totalMonthlyContribution === 0) {
      return [];
    }

    // 임시 계획 객체 생성
    const tempPlan = {
      id: "preview",
      planName: planName || "미리보기",
      planPeriod: parseInt(planPeriod),
      accountPlans,
      totalMonthlyContribution,
      averageTargetReturn,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return preparePlanComparisonChartData(validInvestments, tempPlan, "full");
  }, [
    validInvestments,
    planPeriod,
    accountPlans,
    totalMonthlyContribution,
    averageTargetReturn,
    planName,
  ]);

  // 숫자 포맷팅 함수
  const formatNumber = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, "");
    if (numericValue.includes(".")) {
      return numericValue;
    }
    return numericValue ? Number(numericValue).toLocaleString() : "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;

    // Normalize accountPlans to include only valid investments and clean numeric strings
    const normalizedAccountPlans: typeof accountPlans = validInvestments.reduce(
      (acc, inv) => {
        const raw = accountPlans[inv.id];

        acc[inv.id] = {
          contributionAmount: (raw?.contributionAmount || "0").replace(/,/g, "").trim(),
          contributionFrequency: raw?.contributionFrequency || "월",
          targetAnnualReturn: (raw?.targetAnnualReturn || "0").trim(),
          accountKind: "investment",
        };

        return acc;
      },
      {} as typeof accountPlans
    );

    // Build plan data matching the store's expected shape
    const planData = {
      planName: planName.trim() || "미리보기",
      planPeriod: parseInt(planPeriod, 10),
      accountPlans: normalizedAccountPlans,
      totalMonthlyContribution,
      averageTargetReturn,
    };

    // Save to store
    addPlan(planData);

    // Reset form state
    setPlanName("");
    setPlanPeriod("30");
    setAccountPlans({});

    // Notify and navigate
    alert(`"${planData.planName}" 자산계획이 성공적으로 저장되었습니다!`);
    router.push("/assets");
  };

  return (
    <main className="flex flex-col items-center h-screen p-8">
      <div className="w-full max-w-4xl h-full">
        <PlanHeader />
        <PlanIntro />

        {validInvestments.length === 0 ? (
          <div className="text-center py-12">
            <div className="mb-6">
              <TrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">투자 계좌가 없습니다</h2>
              <p className="text-gray-600 dark:text-gray-400">
                자산계획을 수립하려면 먼저 투자 계좌를 추가해주세요
              </p>
            </div>
            <Link href="/assets/investments">
              <Button>투자 계좌 추가하기</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="h-full flex flex-col gap-8">
            <PlanBasicInfoSection
              planName={planName}
              planPeriod={planPeriod}
              setPlanName={setPlanName}
              setPlanPeriod={setPlanPeriod}
            />

            <AccountPlansSection
              investments={validInvestments}
              accountPlans={accountPlans}
              updateAccountPlan={updateAccountPlan}
              formatNumber={formatNumber}
              getMonthlyContribution={getMonthlyContribution}
            />

            <PlanSummarySection
              planPeriod={planPeriod}
              totalMonthlyContribution={totalMonthlyContribution}
              averageTargetReturn={averageTargetReturn}
            />

            <PlanPreviewChartSection
              previewChartData={previewChartData}
              validInvestments={validInvestments}
              planPeriod={planPeriod}
            />

            {/* 제출 버튼 */}
            <div className="flex justify-center gap-4">
              <Link href="/assets">
                <Button variant="outline" type="button">
                  취소
                </Button>
              </Link>
              <Button type="submit" disabled={!isFormValid()} className="px-8">
                자산계획 생성하기
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
