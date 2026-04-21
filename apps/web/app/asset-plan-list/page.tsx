"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@web/components/ui/button";
import { useAssetPlanStore } from "@web/features/asset-plan/stores/asset-plan-store";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { numberToKorean } from "@web/utils/number-format";
import { Calculator, Calendar, ChevronLeft, Plus, Trash2, TrendingUp } from "lucide-react";

export default function AssetPlanListPage() {
  const plans = useAssetPlanStore((state) => state.plans);
  const deletePlan = useAssetPlanStore((state) => state.deletePlan);
  const isReadOnly = useIsReadOnly();
  const [isLoaded, setIsLoaded] = useState(false);

  // 클라이언트 사이드에서만 실행되도록 useEffect 사용
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // 로딩 중에는 비어있는 화면 표시
  if (!isLoaded) {
    return (
      <main className="flex flex-col items-center min-h-screen p-8">
        <div className="w-full max-w-4xl">
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-bold mb-4">로딩 중...</h1>
          </div>
        </div>
      </main>
    );
  }

  const handleDeletePlan = (planId: string, planName: string) => {
    if (confirm(`"${planName}" 자산계획을 삭제하시겠습니까?`)) {
      deletePlan(planId);
    }
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
            자산계획 목록
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            생성한 자산계획들을 관리하고 시뮬레이션 결과를 확인해보세요
          </p>
        </div>

        {plans.length === 0 ? (
          <div className="text-center py-12">
            <div className="mb-6">
              <TrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">저장된 자산계획이 없습니다</h2>
              <p className="text-gray-600 dark:text-gray-400">
                새로운 자산계획을 만들어 미래 자산 증가를 시뮬레이션해보세요
              </p>
            </div>
            {!isReadOnly && (
              <Link href="/asset-plan">
                <Button className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  자산계획 만들기
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* 새 계획 만들기 버튼 */}
            {!isReadOnly && (
              <div className="flex justify-end">
                <Link href="/asset-plan">
                  <Button className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />새 자산계획 만들기
                  </Button>
                </Link>
              </div>
            )}

            {/* 자산계획 목록 */}
            <div className="grid grid-cols-1 gap-6">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-white dark:bg-gray-800 rounded-xl p-6 border hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-semibold mb-2">{plan.planName}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{plan.planPeriod}년 계획</span>
                        </div>
                        <div>생성일: {plan.createdAt.toLocaleDateString()}</div>
                      </div>
                    </div>
                    {!isReadOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeletePlan(plan.id, plan.planName)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                    <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {numberToKorean(plan.totalMonthlyContribution.toString())}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">월 총 납입금</div>
                    </div>

                    <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {plan.averageTargetReturn.toFixed(1)}%
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        평균 목표 수익률
                      </div>
                    </div>

                    <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {Object.keys(plan.accountPlans).length}개
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">투자 계좌</div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm">
                      상세 보기
                    </Button>
                    <Button size="sm">시뮬레이션 보기</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
