"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { DebtsItem } from "@web/features/debts/types/types";
import { numberToKorean } from "@web/utils/number-format";

interface DebtSummaryProps {
  loans: DebtsItem[];
}

export function DebtSummary({ loans }: DebtSummaryProps) {
  const totals = useMemo(() => {
    const totalAmount = loans.reduce((sum, loan) => sum + (loan.amount || 0), 0);
    const totalMonthlyPayment = loans.reduce((sum, loan) => sum + (loan.monthlyPayment || 0), 0);

    // 총 월 이자 계산
    const totalMonthlyInterest = loans.reduce((sum, loan) => {
      const monthlyInterest = (loan.amount * loan.interestRate) / 100 / 12;
      return sum + monthlyInterest;
    }, 0);

    // 평균 이자율 계산 (가중 평균)
    const averageInterestRate =
      totalAmount > 0
        ? loans.reduce((sum, loan) => sum + loan.amount * loan.interestRate, 0) / totalAmount
        : 0;

    // 대출 유형별 집계
    const byType = loans.reduce(
      (acc, loan) => {
        const type = loan.loanType;
        if (!acc[type]) {
          acc[type] = {
            count: 0,
            amount: 0,
            monthlyPayment: 0,
            monthlyInterest: 0,
          };
        }
        acc[type].count += 1;
        acc[type].amount += loan.amount || 0;
        acc[type].monthlyPayment += loan.monthlyPayment || 0;
        acc[type].monthlyInterest += (loan.amount * loan.interestRate) / 100 / 12;
        return acc;
      },
      {} as Record<
        string,
        { count: number; amount: number; monthlyPayment: number; monthlyInterest: number }
      >
    );

    // 대출기관별 집계
    const byLender = loans.reduce(
      (acc, loan) => {
        const lender = loan.lender || "미지정";
        if (!acc[lender]) {
          acc[lender] = {
            count: 0,
            amount: 0,
            monthlyPayment: 0,
          };
        }
        acc[lender].count += 1;
        acc[lender].amount += loan.amount || 0;
        acc[lender].monthlyPayment += loan.monthlyPayment || 0;
        return acc;
      },
      {} as Record<string, { count: number; amount: number; monthlyPayment: number }>
    );

    return {
      totalAmount,
      totalMonthlyPayment,
      totalMonthlyInterest,
      averageInterestRate,
      byType,
      byLender,
    };
  }, [loans]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>전체 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">총 대출 금액</div>
              <div className="text-xl font-semibold text-red-600 dark:text-red-400">
                {numberToKorean(totals.totalAmount)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">월 상환금</div>
              <div className="text-xl font-semibold">
                {numberToKorean(totals.totalMonthlyPayment)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">월 이자</div>
              <div className="text-xl font-semibold text-orange-600 dark:text-orange-400">
                {numberToKorean(totals.totalMonthlyInterest.toFixed(0))}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">평균 이자율</div>
              <div className="text-xl font-semibold">{totals.averageInterestRate.toFixed(2)}%</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>대출 유형별 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(totals.byType).map(([type, data]) => (
              <div key={type} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <div>
                  <div className="font-medium">{type}</div>
                  <div className="text-sm text-muted-foreground">{data.count}개</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-red-600 dark:text-red-400">
                    {numberToKorean(data.amount)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    월 {numberToKorean(data.monthlyPayment)} (이자:{" "}
                    {numberToKorean(data.monthlyInterest.toFixed(0))})
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>대출기관별 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(totals.byLender).map(([lender, data]) => (
              <div
                key={lender}
                className="flex justify-between items-center p-3 bg-muted rounded-lg"
              >
                <div>
                  <div className="font-medium">{lender}</div>
                  <div className="text-sm text-muted-foreground">{data.count}개</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-red-600 dark:text-red-400">
                    {numberToKorean(data.amount)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    월 {numberToKorean(data.monthlyPayment)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
