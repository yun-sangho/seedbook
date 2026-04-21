"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { useProgressStore } from "@web/features/assets/stores/progress-store";
import { useDebtsStore } from "@web/features/debts/stores/debts-store";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { AddProgressPointDialog } from "./_components/add-progress-point-dialog";
import { AssetProgressChart } from "./_components/asset-progress-chart";
import { progressColumns } from "./_components/columns";
import { ProgressDataTable } from "./_components/progress-data-table";

export default function AssetProgressPage() {
  const investments = useInvestmentStore((state) => state.investments);
  const savings = useSavingsStore((state) => state.savings);
  const realAssets = useRealAssetsStore((state) => state.realAssets);
  const loans = useDebtsStore((state) => state.debts);

  const progressPoints = useProgressStore((state) => state.progressPoints);
  // const setProgressPoints = useProgressStore((state) => state.setProgressPoints);
  const addProgressPoint = useProgressStore((state) => state.addProgressPoint);
  const isReadOnly = useIsReadOnly();

  // 현재 총액 계산
  const currentTotals = useMemo(() => {
    const investmentTotal = investments.reduce((sum, item) => sum + (item.currentValue ?? 0), 0);
    const savingsTotal = savings.reduce((sum, item) => sum + (item.balance ?? 0), 0);
    const realAssetsTotal = realAssets.reduce((sum, item) => sum + (item.currentValue ?? 0), 0);
    const loanTotal = loans.reduce((sum, item) => sum + (item.amount ?? 0), 0);

    return {
      investments: investmentTotal,
      savings: savingsTotal,
      realAssets: realAssetsTotal,
      loans: loanTotal,
    };
  }, [investments, savings, realAssets, loans]);

  return (
    <div className="w-full h-full max-w-6xl p-4 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">자산 기록</h1>
      </div>

      {/* 차트 */}
      <AssetProgressChart progressPoints={progressPoints} />

      {/* 데이터 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>자산 기록 상세</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgressDataTable
            columns={progressColumns}
            data={[...progressPoints].reverse()}
            headerAction={
              isReadOnly ? null : (
                <AddProgressPointDialog currentTotals={currentTotals} onAdd={addProgressPoint} />
              )
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
