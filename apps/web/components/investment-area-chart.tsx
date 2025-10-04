"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart";
import { InvestmentItem } from "@web/features/investments/types/types";
import {
  getTimeRangeLabel,
  prepareInvestmentChartData,
  TimeRange,
} from "@web/utils/investment-chart-utils";
import { numberToKorean } from "@web/utils/number-format";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

interface InvestmentAreaChartProps {
  investments: InvestmentItem[];
}

export function InvestmentAreaChart({ investments }: InvestmentAreaChartProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>(TimeRange.ONE_MONTH);

  const chartData = prepareInvestmentChartData(investments, selectedRange);
  const hasData = chartData.length > 0;

  if (!hasData) {
    return (
      <div className="w-full h-[200px] flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700 rounded-lg">
        <span className="text-gray-400 text-sm mb-2">투자 히스토리 없음</span>
        <span className="text-xs text-gray-500">
          평가금액을 입력하면 히스토리를 확인하실 수 있습니다.
        </span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 시간 범위 선택 버튼들 */}
      <div className="flex gap-2 mb-4 justify-center flex-wrap">
        {[
          TimeRange.ONE_MONTH,
          TimeRange.THREE_MONTHS,
          TimeRange.ONE_YEAR,
          TimeRange.FIVE_YEARS,
          TimeRange.TEN_YEARS,
          TimeRange.ALL,
        ].map((range) => (
          <Button
            key={range}
            variant={"secondary"}
            size="sm"
            onClick={() => setSelectedRange(range)}
            aria-selected={selectedRange === range}
            className="text-xs"
          >
            {getTimeRangeLabel(range)}
          </Button>
        ))}
      </div>

      {/* Area 차트 */}
      <div className="w-full h-[200px]">
        <ChartContainer
          config={{
            totalValue: {
              label: "평가금액",
            },
          }}
          className="h-full w-full"
        >
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="dateFormatted"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#6b7280" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#6b7280" }}
              tickFormatter={(value) => {
                if (value >= 10000) {
                  return `${(value / 10000).toFixed(0)}억`;
                } else if (value >= 1000) {
                  return `${(value / 1000).toFixed(0)}천`;
                } else {
                  return value.toString();
                }
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => `날짜: ${label}`}
                  formatter={(value) => {
                    return (
                      <div className="flex w-full items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                          style={{ backgroundColor: "#22c55e" }}
                        />
                        <span className="text-muted-foreground flex-1">평가금액</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {numberToKorean(value.toString())}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="totalValue"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#areaGradient)"
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}
