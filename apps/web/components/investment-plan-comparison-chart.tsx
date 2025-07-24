"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@web/components/ui/chart";
import { AssetPlan } from "@web/features/asset-plan/types/types";
import { InvestmentItem } from "@web/features/investments/types/types";
import { numberToKorean, truncateToHighestDenomination } from "@web/utils/number-format";
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
  const [zoomPeriod, setZoomPeriod] = useState<"full" | "30years" | "10years" | "5years">("full"); // 줌 기간
  const [scrollPosition, setScrollPosition] = useState(0); // 스크롤 위치 (0-100%)
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    if (!selectedPlan) return [];
    return preparePlanComparisonChartData(investments, selectedPlan, timeRange);
  }, [investments, selectedPlan, timeRange]);

  // 줌 기간에 따른 줌 레벨 계산
  const zoomLevel = useMemo(() => {
    if (!selectedPlan || zoomPeriod === "full") return 1;

    const totalYears = selectedPlan.planPeriod;
    const targetYears = zoomPeriod === "30years" ? 30 : zoomPeriod === "10years" ? 10 : 5;

    if (totalYears <= targetYears) return 1;
    return totalYears / targetYears;
  }, [selectedPlan, zoomPeriod]);

  // 줌과 스크롤에 따른 표시할 데이터 범위 계산
  const visibleData = useMemo(() => {
    if (chartData.length === 0) return [];

    const totalPoints = chartData.length;
    const visiblePoints = Math.max(Math.floor(totalPoints / zoomLevel), 10); // 최소 10개 포인트
    const startIndex = Math.floor((totalPoints - visiblePoints) * (scrollPosition / 100));

    return chartData.slice(startIndex, startIndex + visiblePoints);
  }, [chartData, zoomLevel, scrollPosition]);

  // 터치 제스처 지원
  const [touchStart, setTouchStart] = useState<{ x: number } | null>(null);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 1) {
      // 단일 터치: 팬 시작
      const touch = event.touches[0];
      if (touch) {
        setTouchStart({ x: touch.clientX });
      }
    }
    // 핀치 줌 제거
  }, []);

  const handleTouchMove = useCallback(
    (event: React.TouchEvent) => {
      if (!touchStart) return;

      // 차트 영역에서의 모든 터치 이벤트를 차단하여 브라우저 스크롤 방지
      event.preventDefault();
      event.stopPropagation();

      if (event.touches.length === 1) {
        // 단일 터치: 팬 (줌 상태일 때만 실제 동작)
        if (zoomLevel > 1) {
          const touch = event.touches[0];
          if (touch) {
            const deltaX = touch.clientX - touchStart.x;
            const scrollStep = (deltaX / 300) * 20; // 터치 민감도 조정
            const newPosition = Math.max(0, Math.min(100, scrollPosition - scrollStep));
            setScrollPosition(newPosition);
          }
        }
        // 줌 레벨이 1일 때: 이벤트는 차단하지만 아무 동작 안 함
      }
      // 핀치 줌 제거 - 버튼으로만 줌 조정
    },
    [touchStart, zoomLevel, scrollPosition]
  );

  const handleTouchEnd = useCallback(() => {
    setTouchStart(null);
  }, []);

  // DOM에 직접 이벤트 리스너 추가하여 passive: false로 설정
  useEffect(() => {
    const chartElement = chartContainerRef.current;
    if (!chartElement) return;

    const handleWheelDirect = (event: WheelEvent) => {
      // 강제로 기본 동작 방지
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // 휠 스크롤은 줌 상태일 때만 수평 이동으로 처리
      if (zoomLevel > 1) {
        const { deltaY } = event;
        const scrollStep = 5; // 5% 단위로 스크롤
        const newPosition =
          deltaY > 0
            ? Math.min(scrollPosition + scrollStep, 100)
            : Math.max(scrollPosition - scrollStep, 0);
        setScrollPosition(newPosition);
      }
      // 줌 레벨이 1일 때는 이벤트만 차단하고 아무 동작 안 함
    };

    const handleTouchMoveDirect = (event: TouchEvent) => {
      if (touchStart) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };

    // passive: false로 설정하여 preventDefault 동작하도록 함
    chartElement.addEventListener("wheel", handleWheelDirect, { passive: false });
    chartElement.addEventListener("touchmove", handleTouchMoveDirect, { passive: false });

    return () => {
      chartElement.removeEventListener("wheel", handleWheelDirect);
      chartElement.removeEventListener("touchmove", handleTouchMoveDirect);
    };
  }, [zoomLevel, scrollPosition, touchStart]);

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
      {/* 줌 레벨 선택 버튼 */}
      <div className="flex justify-center gap-2 mb-2">
        {[
          { key: "full" as const, label: "전체 기간" },
          { key: "30years" as const, label: "30년" },
          { key: "10years" as const, label: "10년" },
          { key: "5years" as const, label: "5년" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setZoomPeriod(key);
              setScrollPosition(0); // 줌 변경 시 스크롤 위치 초기화
            }}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              zoomPeriod === key
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

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

      {/* 줌 및 스크롤 안내 */}
      <div className="flex justify-center items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="text-center">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            현재 줌 레벨:{" "}
            {zoomPeriod === "full"
              ? "전체 기간"
              : zoomPeriod === "30years"
                ? "30년"
                : zoomPeriod === "10years"
                  ? "10년"
                  : "5년"}
            {zoomLevel > 1 && ` (${zoomLevel.toFixed(1)}x)`}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            💡 차트 영역에서: 휠=좌우이동 | 모바일: 스와이프 | 줌=상단 버튼
          </div>
        </div>

        {/* 줌 상태일 때 위치 표시 */}
        {zoomLevel > 1 && (
          <div className="text-center">
            <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
              위치: {Math.round(scrollPosition)}%
            </div>
            <div className="w-20 h-2 bg-gray-200 dark:bg-gray-600 rounded-full mt-1">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-200"
                style={{
                  width: `${Math.max(20, 100 / zoomLevel)}%`,
                  marginLeft: `${scrollPosition * (1 - 1 / zoomLevel)}%`,
                }}
              />
            </div>
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
      <div
        ref={chartContainerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative ${zoomLevel > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
        style={{
          touchAction: "none",
          overscrollBehavior: "none",
          overscrollBehaviorY: "none",
          overscrollBehaviorX: "none",
        }}
        title={
          zoomLevel > 1
            ? "휠 스크롤 또는 드래그하여 차트를 좌우로 이동하세요"
            : "상단 버튼으로 줌 레벨을 조정하세요"
        }
      >
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
                return truncateToHighestDenomination(numberToKorean(value.toString()));
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
      </div>

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
