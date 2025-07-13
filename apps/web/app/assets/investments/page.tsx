"use client";

import { useMemo } from "react";
import Link from "next/link";
import { InvestmentDonutChart } from "./_components/investment-donut-chart";
import { InvestmentForm } from "./_components/investment-form";
import { InvestmentList } from "./_components/investment-list";
import { prepareChartData } from "./_utils/chart-utils";
import { parseNumericString } from "./_utils/number-format";
import { useInvestmentStore } from "./_utils/store";

export default function InvestmentsPage() {
  // Zustand store에서 상태 가져오기
  const investments = useInvestmentStore((state) => state.investments);

  // 총 투자금액 계산 - 최적화를 위해 useMemo 사용
  const totalInvestmentValue = useMemo(() => {
    return investments
      .filter((item) => item.currentValue)
      .reduce((sum, item) => sum + parseNumericString(item.currentValue), 0);
  }, [investments]);

  // 차트 데이터 준비
  const chartData = useMemo(() => {
    return prepareChartData(investments);
  }, [investments]);

  // 폼 제출 핸들러 (Zustand store는 즉시 저장되기 때문에 단순 로깅만 수행)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitted investments data:", investments);
    // 데이터가 이미 localStorage에 자동으로 저장됨
    // 여기서는 서버 API로 데이터를 전송하는 로직을 추가할 수 있음
  };

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <Link
            href="/assets"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            돌아가기
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-4">투자 계좌 정보 입력</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            투자 계좌의 기본 정보와 평가금액을 입력해주세요
          </p>

          {investments.length > 0 && investments.some((item) => item.currentValue) && (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6">
              <h2 className="text-lg font-medium mb-4">투자 계좌 요약</h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <InvestmentDonutChart
                    data={chartData}
                    totalAmount={totalInvestmentValue.toString()}
                  />
                </div>
                <InvestmentList investments={investments} />
              </div>
            </div>
          )}
        </div>

        <InvestmentForm handleSubmit={handleSubmit} />
      </div>
    </main>
  );
}
