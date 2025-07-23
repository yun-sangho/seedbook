"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { useAssetPlanStore } from "@web/features/asset-plan/stores/asset-plan-store";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { numberToKorean } from "@web/utils/number-format";
import { Calculator, Calendar, ChevronLeft, Target, TrendingUp } from "lucide-react";

export default function AssetPlanPage() {
  const router = useRouter();
  const investments = useInvestmentStore((state) => state.investments);
  const addPlan = useAssetPlanStore((state) => state.addPlan);
  const validInvestments = investments.filter((item) => item.currentValue > 0);

  // 폼 상태 관리
  const [planName, setPlanName] = useState("");
  const [planPeriod, setPlanPeriod] = useState("30"); // 계획 기간 (년)
  const [accountPlans, setAccountPlans] = useState<{
    [accountId: number]: {
      contributionAmount: string; // 만원 단위
      contributionFrequency: string; // 월/분기/반기/년
      targetAnnualReturn: string;
    };
  }>({});

  // 계좌별 계획 설정 업데이트
  const updateAccountPlan = (accountId: number, field: string, value: string) => {
    setAccountPlans((prev) => ({
      ...prev,
      [accountId]: {
        contributionAmount: prev[accountId]?.contributionAmount || "",
        contributionFrequency: prev[accountId]?.contributionFrequency || "월",
        targetAnnualReturn: prev[accountId]?.targetAnnualReturn || "",
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

  // 월 환산 납입금 계산 헬퍼 함수
  const getMonthlyContribution = (amount: string, frequency: string): number => {
    const numericAmount = parseFloat(amount.replace(/,/g, "")) * 10000; // 만원 단위를 원으로 변환
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

    // 자산계획 데이터 생성
    const planData = {
      planName,
      planPeriod: parseInt(planPeriod),
      accountPlans,
      totalMonthlyContribution,
      averageTargetReturn,
    };

    // 스토어에 자산계획 저장
    addPlan(planData);

    // 성공 메시지 표시 후 자산 페이지로 이동
    alert(`"${planName}" 자산계획이 성공적으로 저장되었습니다!`);
    router.push("/assets");
  };

  return (
    <main className="flex flex-col items-center min-h-screen p-8">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <Link
            href="/assets"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            자산 현황으로 돌아가기
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-4 flex items-center gap-3">
            <Calculator className="w-8 h-8 text-blue-600" />
            자산계획 수립
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            현재 투자 계좌를 기반으로 미래 자산 증가 시뮬레이션을 만들어보세요
          </p>
        </div>

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
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* 계획 기본 정보 */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <Target className="w-5 h-5" />
                계획 기본 정보
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="planName">계획 이름</Label>
                  <Input
                    id="planName"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="예: 은퇴 준비 계획"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="planPeriod" className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    계획 기간 (년)
                  </Label>
                  <Input
                    id="planPeriod"
                    type="number"
                    min="1"
                    max="50"
                    value={planPeriod}
                    onChange={(e) => setPlanPeriod(e.target.value)}
                    placeholder="30"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* 계좌별 설정 */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-6">계좌별 투자 계획</h2>

              <div className="space-y-6">
                {validInvestments.map((investment) => {
                  const plan = accountPlans[investment.id] || {
                    contributionAmount: "",
                    contributionFrequency: "월",
                    targetAnnualReturn: "",
                  };

                  return (
                    <div
                      key={investment.id}
                      className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-700"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold">{investment.accountName}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {investment.accountType} · {investment.accountOwner}
                          </p>
                          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                            현재 잔액: {numberToKorean(investment.currentValue.toString())}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label>추가 납입금 (만원)</Label>
                          <Input
                            type="text"
                            value={plan.contributionAmount}
                            onChange={(e) => {
                              const formatted = formatNumber(e.target.value);
                              updateAccountPlan(investment.id, "contributionAmount", formatted);
                            }}
                            placeholder="100"
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label>납입 주기</Label>
                          <Select
                            value={plan.contributionFrequency}
                            onValueChange={(value) =>
                              updateAccountPlan(investment.id, "contributionFrequency", value)
                            }
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="납입 주기 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="월">월 납입</SelectItem>
                              <SelectItem value="분기">분기 납입</SelectItem>
                              <SelectItem value="반기">반기 납입</SelectItem>
                              <SelectItem value="년">연 납입</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>목표 연 수익률 (%)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="50"
                            value={plan.targetAnnualReturn}
                            onChange={(e) =>
                              updateAccountPlan(investment.id, "targetAnnualReturn", e.target.value)
                            }
                            placeholder="7.0"
                            className="mt-1"
                          />
                        </div>
                      </div>

                      {/* 월 환산 납입금 표시 */}
                      {plan.contributionAmount && plan.contributionFrequency && (
                        <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
                          <span className="text-gray-600 dark:text-gray-400">월 환산 납입금: </span>
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            {numberToKorean(
                              getMonthlyContribution(
                                plan.contributionAmount,
                                plan.contributionFrequency
                              ).toString()
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 계획 요약 */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4 text-blue-800 dark:text-blue-200">
                계획 요약
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {planPeriod}년
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">계획 기간</div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {numberToKorean(totalMonthlyContribution.toString())}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">월 총 납입금</div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {averageTargetReturn.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">평균 목표 수익률</div>
                </div>
              </div>
            </div>

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
