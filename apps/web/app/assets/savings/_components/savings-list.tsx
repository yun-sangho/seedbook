"use client";

import { SavingsItem } from "@web/features/savings/types/types";
import { numberToKorean } from "@web/utils/number-format";

interface SavingsListProps {
  savings: SavingsItem[];
}

export function SavingsList({ savings }: SavingsListProps) {
  // 금액이 있는 계좌만 표시
  const validAccounts = savings.filter((item) => item.amount > 0);

  return (
    <div>
      <div className="space-y-2">
        {validAccounts.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            저축 정보가 없습니다. 아래에서 저축 계좌를 추가해주세요.
          </div>
        ) : (
          validAccounts.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div className="flex flex-col">
                <span className="font-medium">{item.accountName}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{item.accountType}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-bold">{numberToKorean(item.amount.toString())}</span>
                {item.interestRate > 0 && (
                  <span className="text-sm text-green-600 dark:text-green-400">
                    {item.interestRate}%
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
