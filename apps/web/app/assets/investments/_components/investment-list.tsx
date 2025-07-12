"use client";

import { numberToKorean } from "../_utils/number-format";

interface InvestmentListProps {
  investments: Array<{
    id: number;
    accountName: string;
    accountType: string;
    accountOwner: string;
    currency: string;
    currentValue: string;
    note: string;
  }>;
}

export function InvestmentList({ investments }: InvestmentListProps) {
  // 색상 배열
  const colors = [
    "rgba(54, 162, 235, 0.8)",
    "rgba(255, 99, 132, 0.8)",
    "rgba(255, 206, 86, 0.8)",
    "rgba(75, 192, 192, 0.8)",
    "rgba(153, 102, 255, 0.8)",
    "rgba(255, 159, 64, 0.8)",
    "rgba(199, 199, 199, 0.8)",
    "rgba(83, 102, 255, 0.8)",
    "rgba(40, 159, 64, 0.8)",
    "rgba(210, 199, 199, 0.8)",
  ];

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
                backgroundColor: colors[idx % colors.length],
              }}
            />
            <span className="font-medium">{item.accountName}</span>
          </div>
          <div className="text-right">
            {item.currency === "KRW"
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
