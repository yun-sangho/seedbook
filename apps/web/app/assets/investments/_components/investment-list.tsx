"use client";

import { chartColors } from "../_utils/chart-utils";
import { CurrencyType, InvestmentItem } from "../_utils/constants";
import { numberToKorean } from "../_utils/number-format";

interface InvestmentListProps {
  investments: InvestmentItem[];
}

export function InvestmentList({ investments }: InvestmentListProps) {
  // 금액으로 정렬된 투자 항목
  const sortedInvestments = investments
    .filter((item) => item.currentValue)
    .sort(
      (a, b) =>
        parseFloat(b.currentValue.replace(/,/g, "")) - parseFloat(a.currentValue.replace(/,/g, ""))
    );

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
          <div className="text-right">
            {item.currency === CurrencyType.KRW
              ? parseInt(item.currentValue.replace(/,/g, "")) >= 10000
                ? numberToKorean(item.currentValue.replace(/,/g, ""))
                : `${item.currentValue} 만원`
              : `$ ${item.currentValue}`}
          </div>
        </div>
      ))}
    </div>
  );
}
