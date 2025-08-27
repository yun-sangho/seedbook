"use client";

import { numberToKorean } from "@web/utils/number-format";

interface PlanSummarySectionProps {
  planPeriod: string;
  totalMonthlyContribution: number;
  averageTargetReturn: number;
}

export function PlanSummarySection({
  planPeriod,
  totalMonthlyContribution,
  averageTargetReturn,
}: PlanSummarySectionProps) {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-4 text-blue-800 dark:text-blue-200">계획 요약</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{planPeriod}년</div>
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
  );
}
