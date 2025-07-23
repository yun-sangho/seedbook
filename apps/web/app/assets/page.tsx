"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InvestmentAreaChart } from "@web/components/investment-area-chart";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { InvestmentItem } from "@web/features/investments/types/types";
import { numberToKorean } from "@web/utils/number-format";
import { ChevronRight, Landmark } from "lucide-react";

export default function AssetsPage() {
  // 투자 데이터만 로드
  const investments = useInvestmentStore((state) => state.investments);

  // 클라이언트 사이드 렌더링을 위한 상태
  const [isLoaded, setIsLoaded] = useState(false);

  // 투자 자산 존재 여부 확인
  const hasInvestments = () => {
    return investments.some((item) => item.currentValue > 0);
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

  // 투자 자산이 있는 경우 투자 대시보드 표시
  if (hasInvestments()) {
    return <InvestmentDashboardView investments={investments} />;
  }

  // 투자 자산이 없는 경우 투자 입력 페이지 표시
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

        <div className="flex justify-center gap-4 mt-10">
          <Link
            href="/asset-plan"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
          >
            자산계획 수립하기
          </Link>
          <Link
            href="/asset-plan-list"
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 transition-colors"
          >
            자산계획 목록 보기
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
          >
            대시보드 보기
          </Link>
        </div>
      </div>
    </main>
  );
}

// 투자 대시보드 컴포넌트
interface InvestmentDashboardViewProps {
  investments: InvestmentItem[];
}

function InvestmentDashboardView({ investments }: InvestmentDashboardViewProps) {
  // 유효한 투자 항목만 필터링
  const validInvestments = investments.filter((item) => item.currentValue > 0);

  // 총 투자 금액 계산
  const totalInvestments = validInvestments.reduce((sum, item) => sum + item.currentValue, 0);

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-4">투자 자산 현황</h1>

          {/* 투자 자산 카드 */}
          <div className="bg-green-100 dark:bg-green-900/30 rounded-xl p-6 mb-8">
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

            {/* 투자 Area 차트 */}
            <div className="w-full">
              <InvestmentAreaChart investments={validInvestments} />
            </div>
          </div>

          {/* 투자 계좌 목록 */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">투자 계좌 목록</h3>
            <div className="space-y-3">
              {validInvestments.map((investment) => (
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
                      {numberToKorean(investment.currentValue.toString())}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {investment.records.length}개 기록
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-4 mt-10">
          <Link
            href="/asset-plan"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
          >
            자산계획 수립하기
          </Link>
          <Link
            href="/asset-plan-list"
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 transition-colors"
          >
            자산계획 목록 보기
          </Link>
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

// 투자 카드 컴포넌트
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
