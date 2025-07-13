"use client";

import { InvestmentItem } from "@web/features/investments/types/types";
import { chartColors } from "@web/features/investments/utils/chart-utils";
import { calculateReturnRate, formatReturnRate, numberToKorean } from "@web/utils/number-format";

interface InvestmentListProps {
  investments: InvestmentItem[];
}

export function InvestmentList({ investments }: InvestmentListProps) {
  // 금액으로 정렬된 투자 항목
  const sortedInvestments = investments
    .filter((item) => item.currentValue > 0)
    .sort((a, b) => b.currentValue - a.currentValue);

  return (
    <div className="space-y-3 self-center">
      {sortedInvestments.map((item, idx) => (
        <div
          key={`summary-${item.id}`}
          className="flex justify-between items-center p-2 rounded-lg"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: chartColors[idx % chartColors.length],
              }}
            />
            <span className="font-medium">{item.accountName}</span>
          </div>
          <div className="flex flex-col items-end">
            <div>{numberToKorean(item.currentValue)}</div>
            {item.currentValue > 0 && (
              <div
                className={`text-xs ${
                  calculateReturnRate(
                    item.currentValue,
                    item.initialInvestment || Math.round(item.currentValue * 0.5)
                  ) >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {formatReturnRate(
                  calculateReturnRate(
                    item.currentValue,
                    item.initialInvestment || Math.round(item.currentValue * 0.5)
                  )
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
