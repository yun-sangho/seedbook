"use client";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@web/components/ui/chart";
import { InvestmentItem } from "@web/features/investments/types/types";
import { numberToKorean } from "@web/utils/number-format";
import { TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

interface PlanPreviewPoint {
  date: string;
  planned: number;
}

interface PlanPreviewChartSectionProps {
  previewChartData: PlanPreviewPoint[];
  validInvestments: InvestmentItem[];
  planPeriod: string;
}

export function PlanPreviewChartSection({
  previewChartData,
  validInvestments,
  planPeriod,
}: PlanPreviewChartSectionProps) {
  if (previewChartData.length === 0) return null;

  const chartConfig: ChartConfig = {
    planned: {
      label: "예상 자산 가치",
      color: "#3b82f6",
    },
  } as const;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 flex flex-col h-full">
      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
        <TrendingUp className="w-5 h-5" />
        자산 변화 미리보기
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        현재 설정한 투자 계획에 따른 예상 자산 변화를 확인하세요
      </p>
      <div className="h-80 w-full">
        <ChartContainer config={chartConfig}>
          <AreaChart data={previewChartData} margin={{ left: 12, right: 12, top: 12, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => {
                const date = new Date(value);
                return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => {
                if (value >= 100000000) return `${(value / 100000000).toFixed(0)}억`;
                if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
                return value.toString();
              }}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
              labelFormatter={(value) => {
                const date = new Date(value);
                return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
              }}
              formatter={(value) => [numberToKorean(value?.toString() || "0"), "예상 자산 가치"]}
            />
            <Area
              dataKey="planned"
              type="monotone"
              fill={chartConfig.planned!.color}
              fillOpacity={0.4}
              stroke={chartConfig.planned!.color}
              strokeWidth={3}
            />
          </AreaChart>
        </ChartContainer>
      </div>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="text-sm text-blue-700 dark:text-blue-300 mb-1">현재 총 자산</div>
          <div className="text-xl font-semibold text-blue-800 dark:text-blue-200">
            {numberToKorean(
              validInvestments.reduce((sum, inv) => sum + inv.currentValue, 0).toString()
            )}
          </div>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div className="text-sm text-green-700 dark:text-green-300 mb-1">
            {planPeriod}년 후 예상 자산
          </div>
          <div className="text-xl font-semibold text-green-800 dark:text-green-200">
            {previewChartData.length > 0 &&
              numberToKorean(
                previewChartData[previewChartData.length - 1]?.planned?.toString() || "0"
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
