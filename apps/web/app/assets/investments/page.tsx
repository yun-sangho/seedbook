"use client";

import Link from "next/link";
import { InvestmentStackedAreaChart } from "@web/components/investment-stacked-area-chart";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { ChevronLeft } from "lucide-react";
import { InvestmentForm } from "./_components/investment-form";

export default function InvestmentsPage() {
  const investments = useInvestmentStore((state) => state.investments);

  return (
    <main className="flex flex-col items-center min-h-screen p-8">
      <div className="w-full max-w-4xl flex flex-col gap-8">
        {/* <Link
          href="/assets"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
        >
          <ChevronLeft className="w-5 h-5" />
          돌아가기
        </Link> */}

        <div>
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-bold">투자 계좌 정보</h1>
          </div>
          {investments.length > 0 && <InvestmentStackedAreaChart investments={investments} />}
        </div>

        <InvestmentForm />
      </div>
    </main>
  );
}
