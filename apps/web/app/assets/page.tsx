"use client";

import { useMemo } from "react";
import { Tabs, TabsList } from "@web/components/ui/tabs";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useLoansStore } from "@web/features/loans/stores/loans-store";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { AssetDonutChart } from "./_components/asset-donut-chart";
import { AssetTabContent, AssetTabTrigger, EmptyAssetState } from "./_components/asset-tab-section";

export default function AssetsOverviewPage() {
  const investments = useInvestmentStore((state) => state.investments);
  const savings = useSavingsStore((state) => state.savings);
  const loans = useLoansStore((state) => state.loans);
  const realAssets = useRealAssetsStore((state) => state.realAssets);

  const assetTotals = useMemo(() => {
    const investmentTotal = investments.reduce((sum, item) => sum + (item.currentValue ?? 0), 0);
    const savingsTotal = savings.reduce((sum, item) => sum + (item.balance ?? 0), 0);
    const realAssetsTotal = realAssets.reduce((sum, item) => sum + (item.currentValue ?? 0), 0);
    const loanTotal = loans.reduce((sum, item) => sum + (item.amount ?? 0), 0);

    return {
      investment: investmentTotal,
      savings: savingsTotal,
      realAssets: realAssetsTotal,
      loans: loanTotal,
    };
  }, [investments, savings, realAssets, loans]);

  const netAssets = useMemo(() => {
    return (
      assetTotals.investment + assetTotals.savings + assetTotals.realAssets - assetTotals.loans
    );
  }, [assetTotals]);

  const chartData = useMemo(() => {
    const accountTypeMap = new Map<string, number>();

    // 투자 계좌 타입별 집계
    investments.forEach((investment) => {
      const currentValue = accountTypeMap.get(investment.accountType) ?? 0;
      accountTypeMap.set(investment.accountType, currentValue + (investment.currentValue ?? 0));
    });

    // 저축 계좌 타입별 집계
    savings.forEach((saving) => {
      const currentValue = accountTypeMap.get(saving.accountType) ?? 0;
      accountTypeMap.set(saving.accountType, currentValue + (saving.balance ?? 0));
    });

    // 실물자산 타입별 집계
    realAssets.forEach((asset) => {
      const currentValue = accountTypeMap.get(asset.assetType) ?? 0;
      accountTypeMap.set(asset.assetType, currentValue + (asset.currentValue ?? 0));
    });

    // 대출 타입별 집계
    loans.forEach((loan) => {
      const currentValue = accountTypeMap.get(loan.loanType) ?? 0;
      accountTypeMap.set(loan.loanType, currentValue + (loan.amount ?? 0));
    });

    // 차트용 색상 배열 (충분히 많은 색상)
    const colors = [
      "#3b82f6", // blue-500
      "#10b981", // green-500
      "#f59e0b", // amber-500
      "#ef4444", // red-500
      "#8b5cf6", // violet-500
      "#ec4899", // pink-500
      "#06b6d4", // cyan-500
      "#84cc16", // lime-500
      "#f97316", // orange-500
      "#6366f1", // indigo-500
      "#14b8a6", // teal-500
      "#a855f7", // purple-500
      "#eab308", // yellow-500
      "#22c55e", // green-600
      "#0ea5e9", // sky-500
      "#d946ef", // fuchsia-500
    ];

    // Map을 배열로 변환하고 색상 할당
    const data = Array.from(accountTypeMap.entries())
      .filter(([, value]) => value > 0)
      .map(([name, value], index) => ({
        name,
        value,
        fill: colors[index % colors.length] as string,
      }));

    return data;
  }, [investments, savings, realAssets, loans]);

  const assetTabsData = useMemo(
    () => [
      {
        value: "investments",
        label: "투자",
        total: assetTotals.investment,
        detailUrl: "/assets/investments",
        items: investments.map((investment) => ({
          id: investment.id,
          primaryText: investment.accountName,
          secondaryText: `${investment.accountType} · ${investment.accountOwner}`,
          value: investment.currentValue ?? 0,
        })),
        emptyMessage: "투자 계좌가 없습니다.",
      },
      {
        value: "savings",
        label: "저축",
        total: assetTotals.savings,
        detailUrl: "/assets/savings",
        items: savings.map((saving) => ({
          id: saving.id,
          primaryText: saving.accountName,
          secondaryText: `${saving.accountType} · ${saving.accountOwner}`,
          value: saving.balance ?? 0,
        })),
        emptyMessage: "저축 계좌가 없습니다.",
      },
      {
        value: "realAssets",
        label: "실물자산",
        total: assetTotals.realAssets,
        detailUrl: "/assets/real-assets",
        items: realAssets.map((asset) => ({
          id: asset.id,
          primaryText: asset.assetName,
          secondaryText: asset.assetType,
          value: asset.currentValue ?? 0,
        })),
        emptyMessage: "실물자산이 없습니다.",
      },
      {
        value: "loans",
        label: "부채",
        total: assetTotals.loans,
        detailUrl: "/assets/loans",
        items: loans.map((loan) => ({
          id: loan.id,
          primaryText: loan.loanName,
          secondaryText: `${loan.loanType} · ${loan.lender}`,
          value: loan.amount ?? 0,
        })),
        emptyMessage: "부채가 없습니다.",
      },
    ],
    [assetTotals, investments, savings, realAssets, loans]
  );

  const hasAnyAssets = chartData.length > 0;

  return (
    <div className="w-full h-full max-w-6xl p-4">
      {!hasAnyAssets ? (
        <EmptyAssetState />
      ) : (
        <div className="w-full h-full space-y-4">
          <AssetDonutChart chartData={chartData} netAssets={netAssets} />

          <Tabs defaultValue="investments" className="w-full">
            <div className="w-full overflow-x-auto">
              <TabsList className="inline-flex w-auto min-w-full h-full">
                {assetTabsData.map((tab) => (
                  <AssetTabTrigger key={tab.value} value={tab.value} label={tab.label} />
                ))}
              </TabsList>
            </div>

            {assetTabsData.map((tab) => (
              <AssetTabContent
                key={tab.value}
                value={tab.value}
                total={tab.total}
                detailUrl={tab.detailUrl}
                items={tab.items}
                emptyMessage={tab.emptyMessage}
              />
            ))}
          </Tabs>
        </div>
      )}
    </div>
  );
}
