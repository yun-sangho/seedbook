"use client";

import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { InvestmentItem } from "@web/features/investments/types/types";
import { numberToKorean } from "@web/utils/number-format";

interface AccountPlanItemProps {
  investment: InvestmentItem;
  plan: { contributionAmount: string; contributionFrequency: string; targetAnnualReturn: string };
  updateAccountPlan: (id: number, field: string, value: string) => void;
  formatNumber: (v: string) => string;
  getMonthlyContribution: (amount: string, frequency: string) => number;
}

export function AccountPlanItem({
  investment,
  plan,
  updateAccountPlan,
  formatNumber,
  getMonthlyContribution,
}: AccountPlanItemProps) {
  const monthlyContribution =
    plan.contributionAmount && plan.contributionFrequency
      ? getMonthlyContribution(plan.contributionAmount, plan.contributionFrequency)
      : 0;

  return (
    <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-700" key={investment.id}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-semibold">{investment.accountName}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {investment.accountType} · {investment.accountOwner}
          </p>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            현재 잔액: {numberToKorean(investment.currentValue.toString())}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor={`contributionAmount-${investment.id}`}>추가 납입금 (만원)</Label>
          <Input
            id={`contributionAmount-${investment.id}`}
            type="text"
            value={plan.contributionAmount}
            onChange={(e) => {
              const formatted = formatNumber(e.target.value);
              updateAccountPlan(investment.id, "contributionAmount", formatted);
            }}
            placeholder="100"
            className="mt-1"
            aria-describedby={
              monthlyContribution > 0 ? `monthlyContributionHint-${investment.id}` : undefined
            }
          />
        </div>

        <div>
          <Label htmlFor={`contributionFrequency-${investment.id}`}>납입 주기</Label>
          <Select
            value={plan.contributionFrequency}
            onValueChange={(value) =>
              updateAccountPlan(investment.id, "contributionFrequency", value)
            }
          >
            <SelectTrigger id={`contributionFrequency-${investment.id}`} className="mt-1">
              <SelectValue placeholder="납입 주기 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="월">월 납입</SelectItem>
              <SelectItem value="분기">분기 납입</SelectItem>
              <SelectItem value="반기">반기 납입</SelectItem>
              <SelectItem value="년">연 납입</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor={`targetAnnualReturn-${investment.id}`}>목표 연 수익률 (%)</Label>
          <Input
            id={`targetAnnualReturn-${investment.id}`}
            type="number"
            step="0.1"
            min="0"
            max="50"
            value={plan.targetAnnualReturn}
            onChange={(e) => updateAccountPlan(investment.id, "targetAnnualReturn", e.target.value)}
            placeholder="7.0"
            className="mt-1"
          />
        </div>
      </div>

      {monthlyContribution > 0 && (
        <div
          id={`monthlyContributionHint-${investment.id}`}
          className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm"
        >
          <span className="text-gray-600 dark:text-gray-400">월 환산 납입금: </span>
          <span className="font-medium text-blue-600 dark:text-blue-400">
            {numberToKorean(monthlyContribution.toString())}
          </span>
        </div>
      )}
    </div>
  );
}
