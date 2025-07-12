"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { InvestmentDonutChart } from "./_components/investment-donut-chart";
import { InvestmentForm } from "./_components/investment-form";
import { InvestmentList } from "./_components/investment-list";
import { prepareChartData } from "./_utils/chart-utils";
import { parseNumericString } from "./_utils/number-format";

export default function InvestmentsPage() {
  // 투자 계좌 데이터 상태
  const [investments, setInvestments] = useState([
    {
      id: 1,
      accountName: "투자 계좌 #1", // 기본 계좌 이름으로 설정
      accountType: "",
      accountOwner: "본인",
      currency: "KRW",
      currentValue: "",
      note: "",
    },
  ]);

  // 현재 열려있는 계좌 폼 ID 추적
  const [expandedFormId, setExpandedFormId] = useState<number>(1);

  // 사용자 정의 소유자 추가 기능
  const [customOwners, setCustomOwners] = useState<string[]>([]);

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

  // 폼 제출 핸들러
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitted investments data:", investments);
    // Here you would save the data to your backend
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

        <InvestmentForm
          investments={investments}
          setInvestments={setInvestments}
          expandedFormId={expandedFormId}
          setExpandedFormId={setExpandedFormId}
          customOwners={customOwners}
          setCustomOwners={setCustomOwners}
          handleSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}
