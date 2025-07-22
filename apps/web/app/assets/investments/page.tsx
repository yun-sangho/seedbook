"use client";

import { useState } from "react";
import Link from "next/link";
import { InvestmentStackedAreaChart } from "@web/components/investment-stacked-area-chart";
import { Button } from "@web/components/ui/button";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { ChevronLeft } from "lucide-react";
import { AddInvestmentModal } from "./_components/add-investment-modal";
import { InvestmentForm } from "./_components/investment-form";

export default function InvestmentsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const investments = useInvestmentStore((state) => state.investments);

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
            <h1 className="text-xl font-bold">투자 계좌 정보</h1>
          </div>
          {investments.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-4">계좌별 투자 변화 추이</h2>
              <InvestmentStackedAreaChart investments={investments} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <InvestmentForm />
          <Button
            onClick={openAddAccountModal}
            size={"lg"}
            className="bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 투자 계좌 추가
          </Button>
        </div>

        <AddInvestmentModal isOpen={isModalOpen} onClose={closeAddAccountModal} />
      </div>
    </main>
  );
}
