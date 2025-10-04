"use client";

import { InvestmentStackedAreaChart } from "@web/components/investment-stacked-area-chart";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { InvestmentForm } from "./_components/investment-form";

export default function InvestmentsPage() {
  const investments = useInvestmentStore((state) => state.investments);

  return (
    <main className="flex flex-col items-center min-h-screen p-8">
      <div className="w-full max-w-4xl flex flex-col gap-8">
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
