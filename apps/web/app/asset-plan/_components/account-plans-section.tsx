"use client";

import { InvestmentItem } from "@web/features/investments/types/types";
import { AccountPlanItem } from "./account-plan-item";

interface AccountPlansSectionProps {
  investments: InvestmentItem[];
  accountPlans: {
    [accountId: number]: {
      contributionAmount: string;
      contributionFrequency: string;
      targetAnnualReturn: string;
    };
  };
  updateAccountPlan: (id: number, field: string, value: string) => void;
  formatNumber: (v: string) => string;
  getMonthlyContribution: (amount: string, frequency: string) => number;
}

export function AccountPlansSection({
  investments,
  accountPlans,
  updateAccountPlan,
  formatNumber,
  getMonthlyContribution,
}: AccountPlansSectionProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-6">계좌별 투자 계획</h2>
      <div className="space-y-6">
        {investments.map((investment) => (
          <AccountPlanItem
            key={investment.id}
            investment={investment}
            plan={
              accountPlans[investment.id] || {
                contributionAmount: "",
                contributionFrequency: "월",
                targetAnnualReturn: "",
              }
            }
            updateAccountPlan={updateAccountPlan}
            formatNumber={formatNumber}
            getMonthlyContribution={getMonthlyContribution}
          />
        ))}
      </div>
    </div>
  );
}
