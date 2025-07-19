"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { prepareChartData } from "@web/features/investments/utils/chart-utils";
import { ChevronLeft } from "lucide-react";
import { AddInvestmentModal } from "./_components/add-investment-modal";
import { InvestmentDonutChart } from "./_components/investment-donut-chart";
import { InvestmentForm } from "./_components/investment-form";
import { InvestmentList } from "./_components/investment-list";

export default function InvestmentsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const investments = useInvestmentStore((state) => state.investments);

  const totalInvestmentValue = useMemo(() => {
    return investments
      .filter((item) => item.records.length > 0)
      .map((item) => item.records[0]?.currentValue || 0)
      .reduce((sum, value) => sum + value, 0);
  }, [investments]);

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

  // 투자 계좌 추가 모달 열기
  const openAddAccountModal = () => {
    setIsModalOpen(true);
  };

  // 투자 계좌 추가 모달 닫기
  const closeAddAccountModal = () => {
    setIsModalOpen(false);
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
            돌아가기
          </Link>
        </div>

        <div className="mb-10">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold">투자 계좌 정보</h1>
            <button
              onClick={openAddAccountModal}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + 투자 계좌 추가
            </button>
          </div>
          {investments.length > 0 && (
            <div className="grid md:grid-cols-2 gap-6">
              <InvestmentDonutChart
                data={chartData}
                totalAmount={totalInvestmentValue.toString()}
              />
              {/* <InvestmentList investments={investments} /> */}
            </div>
          )}
        </div>

        <InvestmentForm handleSubmit={handleSubmit} />

        {/* 새 투자 계좌 추가 모달 */}
        <AddInvestmentModal isOpen={isModalOpen} onClose={closeAddAccountModal} />
      </div>
    </main>
  );
}
