"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { useProgressStore } from "@web/features/assets/stores/progress-store";
import {
  ASSET_PROGRESS_VIEW_LABELS,
  type AssetProgressView,
} from "@web/features/assets/types/progress";
import { generateCumulativeProgressPoints } from "@web/features/assets/utils/progress-utils";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useLoansStore } from "@web/features/loans/stores/loans-store";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { numberToKorean } from "@web/utils/number-format";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AddProgressPointDialog } from "./_components/add-progress-point-dialog";
import { progressColumns } from "./_components/columns";
import { ProgressDataTable } from "./_components/progress-data-table";

export default function AssetProgressPage() {
  const investments = useInvestmentStore((state) => state.investments);
  const savings = useSavingsStore((state) => state.savings);
  const realAssets = useRealAssetsStore((state) => state.realAssets);
  const loans = useLoansStore((state) => state.loans);

  const progressPoints = useProgressStore((state) => state.progressPoints);
  const setProgressPoints = useProgressStore((state) => state.setProgressPoints);
  const addProgressPoint = useProgressStore((state) => state.addProgressPoint);

  const [selectedView, setSelectedView] = useState<AssetProgressView>("netAssets");

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

  // 자산 변경 시 자동으로 progress points 업데이트
  useEffect(() => {
    const generatedPoints = generateCumulativeProgressPoints(
      investments,
      savings,
      realAssets,
      loans
    );
    setProgressPoints(generatedPoints);
  }, [investments, savings, realAssets, loans, setProgressPoints]);

  // 차트 데이터 준비
  const chartData = useMemo(() => {
    return progressPoints.map((point) => {
      const date = new Date(point.date);
      const dateFormatted = isNaN(date.getTime())
        ? point.date
        : date.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });

      return {
        date: point.date,
        value: point[selectedView],
        dateFormatted,
      };
    });
  }, [progressPoints, selectedView]);

  // 통계 계산
  const stats = useMemo(() => {
    if (progressPoints.length === 0) {
      return {
        current: 0,
        initial: 0,
        change: 0,
        changePercent: 0,
      };
    }

    const latest = progressPoints[progressPoints.length - 1];
    const first = progressPoints[0];

    if (!latest || !first) {
      return {
        current: 0,
        initial: 0,
        change: 0,
        changePercent: 0,
      };
    }

    const currentValue = latest[selectedView];
    const initialValue = first[selectedView];
    const change = currentValue - initialValue;
    const changePercent = initialValue !== 0 ? (change / initialValue) * 100 : 0;

    return {
      current: currentValue,
      initial: initialValue,
      change,
      changePercent,
    };
  }, [progressPoints, selectedView]);

  return (
    <div className="w-full h-full max-w-6xl p-4 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">자산 기록</h1>
        <div className="flex items-center gap-2">
          <AddProgressPointDialog currentTotals={currentTotals} onAdd={addProgressPoint} />
          <Select
            value={selectedView}
            onValueChange={(v) => setSelectedView(v as AssetProgressView)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ASSET_PROGRESS_VIEW_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">현재 금액</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{numberToKorean(stats.current.toString())}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">시작 금액</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{numberToKorean(stats.initial.toString())}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">변화량</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                stats.change >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {stats.change >= 0 ? "+" : ""}
              {numberToKorean(stats.change.toString())}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">변화율</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                stats.changePercent >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {stats.changePercent >= 0 ? "+" : ""}
              {stats.changePercent.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>{ASSET_PROGRESS_VIEW_LABELS[selectedView]} 추이</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center text-gray-500">
              기록된 자산 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="dateFormatted"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    if (value >= 100000000) {
                      return `${(value / 100000000).toFixed(0)}억`;
                    }
                    if (value >= 10000) {
                      return `${(value / 10000).toFixed(0)}만`;
                    }
                    return value.toString();
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length && payload[0]) {
                      const data = payload[0];
                      return (
                        <div className="bg-background border rounded-lg p-3 shadow-md">
                          <p className="text-sm font-medium mb-1">
                            {data.payload?.dateFormatted ?? ""}
                          </p>
                          <p className="text-lg font-bold text-blue-600">
                            {numberToKorean(data.value?.toString() ?? "0")}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 데이터 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>자산 기록 상세</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgressDataTable columns={progressColumns} data={[...progressPoints].reverse()} />
        </CardContent>
      </Card>
    </div>
  );
}
