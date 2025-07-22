"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart";
import { InvestmentItem } from "@web/features/investments/types/types";
import { getTimeRangeLabel, TimeRange } from "@web/utils/investment-chart-utils";
import { numberToKorean } from "@web/utils/number-format";
import { prepareStackedAreaChartData } from "@web/utils/stacked-area-chart-utils";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

interface InvestmentStackedAreaChartProps {
  investments: InvestmentItem[];
}

export function InvestmentStackedAreaChart({ investments }: InvestmentStackedAreaChartProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>("30days");

  const { data, config } = prepareStackedAreaChartData(investments, selectedRange);
  const hasData = data.length > 0;

  // Y축 최대값 계산 (최대값의 120%)
  const maxValue = hasData
    ? Math.max(
        ...data.map((item) => {
          const accountKeys = Object.keys(config);
          return accountKeys.reduce((sum, key) => sum + ((item[key] as number) || 0), 0);
        })
      )
    : 0;
  const yAxisMax = Math.ceil(maxValue * 1.2);

  if (!hasData) {
    return (
      <div className="w-full h-[300px] flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700 rounded-lg">
        <span className="text-gray-400 text-sm mb-2">투자 히스토리 없음</span>
        <span className="text-xs text-gray-500">평가금액을 변경하면 히스토리가 생성됩니다</span>
      </div>
    );
  }

  // 계좌별 키 배열 생성 (stacking 순서 결정)
  const accountKeys = Object.keys(config);

  return (
    <div className="w-full">
      {/* 시간 범위 선택 버튼들 */}
      <div className="flex gap-2 mb-4 justify-center">
        {(["30days", "3months", "1year"] as TimeRange[]).map((range) => (
          <Button
            key={range}
            variant={selectedRange === range ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedRange(range)}
            className="text-xs"
          >
            {getTimeRangeLabel(range)}
          </Button>
        ))}
      </div>

      {/* Stacked Area 차트 */}
      <div className="w-full h-[300px]">
        <ChartContainer config={config} className="h-full w-full">
          <AreaChart data={data}>
            <defs>
              {accountKeys.map((key) => (
                <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={config[key]?.color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={config[key]?.color} stopOpacity={0.2} />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              dataKey="dateFormatted"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#6b7280" }}
            />
            <YAxis
              axisLine={true}
              tick={{ fontSize: 10, fill: "#6b7280" }}
              tickCount={10}
              domain={[0, yAxisMax]}
              tickFormatter={(value) => {
                return numberToKorean(value.toString());
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    const accountName = config[name as string]?.label || name;
                    return [numberToKorean(value.toString()), accountName];
                  }}
                  labelFormatter={(label) => `날짜: ${label}`}
                />
              }
            />
            {accountKeys.map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stackId="1"
                stroke={config[key]?.color}
                strokeWidth={1}
                fill={`url(#gradient-${key})`}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 mt-4 justify-center">
        {accountKeys.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config[key]?.color }} />
            <span className="text-xs text-gray-600 dark:text-gray-400">{config[key]?.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
