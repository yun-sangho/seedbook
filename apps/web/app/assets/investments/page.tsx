"use client";

import { InvestmentStackedAreaChart } from "@web/components/investment-stacked-area-chart";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { InvestmentManager } from "./_components/investment-manager";

export default function InvestmentsPage() {
  const investments = useInvestmentStore((state) => state.investments);

  return (
    <div className="w-full flex flex-col gap-8 py-8">
      {investments.length > 0 && (
        <div className="px-4">
          <InvestmentStackedAreaChart investments={investments} />
        </div>
      )}
      <div className="px-6">
        <InvestmentManager />
      </div>
    </div>
  );
}
