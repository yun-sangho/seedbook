"use client";

import { useMemo, useState } from "react";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@web/components/ui/chart";
import { AssetPlan } from "@web/features/asset-plan/types/types";
import { InvestmentItem } from "@web/features/investments/types/types";
import { numberToKorean } from "@web/utils/number-format";
import { preparePlanComparisonChartData } from "@web/utils/plan-comparison-utils";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

interface InvestmentPlanComparisonChartProps {
  investments: InvestmentItem[];
  selectedPlan?: AssetPlan;
}

const chartConfig = {
  actual: {
    label: "실제 투자 성과",
    color: "#10b981", // 녹색 - 실제 성과
  },
  planned: {
    label: "계획 예상 성과",
    color: "#3b82f6", // 파란색 - 계획 성과
  },
} satisfies ChartConfig;

export function InvestmentPlanComparisonChart({
  investments,
  selectedPlan,
}: InvestmentPlanComparisonChartProps) {
  const [timeRange, setTimeRange] = useState<"30days" | "3months" | "1year" | "full">("full");
  const [zoomLevel, setZoomLevel] = useState(1); // 줌 레벨 (1 = 기본)
  const [scrollPosition, setScrollPosition] = useState(0); // 스크롤 위치 (0-100%)

  const chartData = useMemo(() => {
    if (!selectedPlan) return [];
    return preparePlanComparisonChartData(investments, selectedPlan, timeRange);
  }, [investments, selectedPlan, timeRange]);

  // 줌과 스크롤에 따른 표시할 데이터 범위 계산
  const visibleData = useMemo(() => {
    if (chartData.length === 0) return [];

    const totalPoints = chartData.length;
    const visiblePoints = Math.max(Math.floor(totalPoints / zoomLevel), 10); // 최소 10개 포인트
    const startIndex = Math.floor((totalPoints - visiblePoints) * (scrollPosition / 100));

    return chartData.slice(startIndex, startIndex + visiblePoints);
  }, [chartData, zoomLevel, scrollPosition]);

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev * 1.5, 5)); // 최대 5배 줌
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev / 1.5, 1)); // 최소 1배 (기본)
    if (zoomLevel <= 1.5) {
      setScrollPosition(0); // 줌 아웃 시 스크롤 위치 초기화
    }
  };

  const handleScroll = (direction: "left" | "right") => {
    const step = 10; // 10% 단위로 스크롤
    if (direction === "left") {
      setScrollPosition((prev) => Math.max(prev - step, 0));
    } else {
      setScrollPosition((prev) => Math.min(prev + step, 100));
    }
  };

  if (!selectedPlan) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg">
        <p className="text-gray-500 dark:text-gray-400">
          자산계획을 선택하면 비교 차트가 표시됩니다
        </p>
      </div>
    );
  }

  // Y축 최대값 계산 (20% 여유 공간)
  const maxValue = Math.max(...visibleData.map((d) => Math.max(d.actual || 0, d.planned)));
  const yAxisMax = Math.ceil(maxValue * 1.2);

  // 현재 날짜
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="w-full space-y-4">
      {/* 시간 범위 선택 버튼 */}
      <div className="flex justify-center gap-2">
        {[
          { key: "30days" as const, label: "30일" },
          { key: "3months" as const, label: "3개월" },
          { key: "1year" as const, label: "1년" },
          { key: "full" as const, label: "전체 계획" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTimeRange(key)}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              timeRange === key
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 줌 및 스크롤 컨트롤 */}
      <div className="flex justify-center items-center gap-4 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">기간 조정:</span>
          <button
            onClick={handleZoomOut}
            disabled={zoomLevel <= 1}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="확대 (더 적은 기간 표시)"
          >
            -
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[60px] text-center">
            {zoomLevel === 1 ? "전체" : `${zoomLevel.toFixed(1)}x`}
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoomLevel >= 5}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="축소 (더 많은 기간 표시)"
          >
            +
          </button>
        </div>

        {/* 스크롤 컨트롤 - 줌 상태일 때만 표시 */}
        {zoomLevel > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">위치:</span>
            <button
              onClick={() => handleScroll("left")}
              disabled={scrollPosition <= 0}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="이전 구간"
            >
              ←
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[50px] text-center">
              {Math.round(scrollPosition)}%
            </span>
            <button
              onClick={() => handleScroll("right")}
              disabled={scrollPosition >= 100}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="다음 구간"
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* 계획 정보 및 범례 */}
      <div className="space-y-3">
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-blue-800 dark:text-blue-200">
              비교 중인 계획: {selectedPlan.planName}
            </h4>
            <div className="text-sm text-blue-600 dark:text-blue-400">
              계획 기간: {selectedPlan.planPeriod}년 · 월 납입:{" "}
              {numberToKorean(selectedPlan.totalMonthlyContribution.toString())} · 목표 수익률:{" "}
              {selectedPlan.averageTargetReturn.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* 범례 */}
        <div className="flex justify-center gap-6 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-sm border-2"
              style={{
                backgroundColor: chartConfig.actual.color + "99", // 60% opacity
                borderColor: chartConfig.actual.color,
              }}
            />
            <span className="text-sm font-medium" style={{ color: chartConfig.actual.color }}>
              {chartConfig.actual.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-sm border-2 border-dashed"
              style={{
                backgroundColor: chartConfig.planned.color + "4D", // 30% opacity
                borderColor: chartConfig.planned.color,
              }}
            />
            <span className="text-sm font-medium" style={{ color: chartConfig.planned.color }}>
              {chartConfig.planned.label}
            </span>
          </div>
        </div>
      </div>

      {/* 차트 */}
      <ChartContainer config={chartConfig} className="h-80 w-full">
        <AreaChart
          accessibilityLayer
          data={visibleData}
          margin={{
            left: 12,
            right: 12,
            top: 12,
            bottom: 12,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => {
              const date = new Date(value);
              return timeRange === "full"
                ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
                : `${date.getMonth() + 1}/${date.getDate()}`;
            }}
          />

          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            domain={[0, yAxisMax]}
            tickFormatter={(value) => {
              if (value >= 100000000) {
                return `${(value / 100000000).toFixed(0)}억`;
              } else if (value >= 10000) {
                return `${(value / 10000).toFixed(0)}만`;
              } else {
                return value.toString();
              }
            }}
          />

          {/* 현재 날짜 구분선 */}
          <ReferenceLine
            x={today}
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="4 4"
            label={{
              value: "오늘",
              position: "top",
              style: { fill: "#ef4444", fontWeight: "bold" },
            }}
          />

          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent />}
            labelFormatter={(value) => {
              const date = new Date(value);
              return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
            }}
            formatter={(value, name) => [
              numberToKorean(value?.toString() || "0"),
              chartConfig[name as keyof typeof chartConfig]?.label || name,
            ]}
          />

          {/* 실제 투자 성과 영역 */}
          <Area
            dataKey="actual"
            type="monotone"
            fill={chartConfig.actual.color}
            fillOpacity={0.6}
            stroke={chartConfig.actual.color}
            strokeWidth={3}
            connectNulls={false}
          />

          {/* 계획 예상 영역 */}
          <Area
            dataKey="planned"
            type="monotone"
            fill={chartConfig.planned.color}
            fillOpacity={0.3}
            stroke={chartConfig.planned.color}
            strokeWidth={3}
            strokeDasharray="6 6"
          />
        </AreaChart>
      </ChartContainer>

      {/* 성과 비교 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border-l-4 border-green-500">
          <div className="text-sm text-green-700 dark:text-green-300 mb-1">현재 실제 성과</div>
          <div className="text-lg font-semibold text-green-800 dark:text-green-200">
            {(() => {
              const currentData = chartData.find(
                (d) => d.actual !== null && d.actual !== undefined
              );
              return numberToKorean(currentData?.actual?.toString() || "0");
            })()}
          </div>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-l-4 border-blue-500">
          <div className="text-sm text-blue-700 dark:text-blue-300 mb-1">
            {timeRange === "full" ? `${selectedPlan.planPeriod}년 후` : "최종"} 예상 성과
          </div>
          <div className="text-lg font-semibold text-blue-800 dark:text-blue-200">
            {chartData.length > 0 &&
              numberToKorean(chartData[chartData.length - 1]?.planned?.toString() || "0")}
          </div>
        </div>

        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border-l-4 border-purple-500">
          <div className="text-sm text-purple-700 dark:text-purple-300 mb-1">예상 성장률</div>
          <div className="text-lg font-semibold text-purple-800 dark:text-purple-200">
            {(() => {
              const currentValue = chartData.find((d) => d.actual !== null)?.actual || 0;
              const finalValue = chartData[chartData.length - 1]?.planned || 0;
              const growthRate =
                currentValue > 0 ? ((finalValue - currentValue) / currentValue) * 100 : 0;
              return `${growthRate.toFixed(1)}%`;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
