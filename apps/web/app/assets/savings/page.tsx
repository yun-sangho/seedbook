"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { prepareChartData } from "@web/features/savings/utils/chart-utils";
import { AddSavingsModal } from "./_components/add-savings-modal";
import { SavingsDonutChart } from "./_components/savings-donut-chart";
import { SavingsForm } from "./_components/savings-form";
import { SavingsList } from "./_components/savings-list";

export default function SavingsPage() {
  // 모달 표시 상태
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Zustand store에서 상태 가져오기
  const savings = useSavingsStore((state) => state.savings);

  // 총 저축금액 계산 - 최적화를 위해 useMemo 사용
  const totalSavingsAmount = useMemo(() => {
    return savings.filter((item) => item.amount).reduce((sum, item) => sum + item.amount, 0);
  }, [savings]);

  // 차트 데이터 준비
  const chartData = useMemo(() => {
    return prepareChartData(savings);
  }, [savings]);

  // 폼 제출 핸들러 (Zustand store는 즉시 저장되기 때문에 단순 로깅만 수행)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitted savings data:", savings);
    // 데이터가 이미 localStorage에 자동으로 저장됨
    // 여기서는 서버 API로 데이터를 전송하는 로직을 추가할 수 있음
  };

  // 저축 계좌 추가 모달 열기
  const openAddAccountModal = () => {
    setIsModalOpen(true);
  };

  // 저축 계좌 추가 모달 닫기
  const closeAddAccountModal = () => {
    setIsModalOpen(false);
  };

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
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
            <h1 className="text-3xl font-bold">저축 정보 입력</h1>
            <button
              onClick={openAddAccountModal}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + 저축 계좌 추가
            </button>
          </div>

          <p className="text-gray-600 dark:text-gray-400 mb-6">
            예금, 적금, 현금성 자산 정보를 입력해주세요
          </p>
        </div>

        <SavingsForm handleSubmit={handleSubmit} />

        {/* 새 저축 계좌 추가 모달 */}
        <AddSavingsModal isOpen={isModalOpen} onClose={closeAddAccountModal} />
      </div>
    </main>
  );
}
