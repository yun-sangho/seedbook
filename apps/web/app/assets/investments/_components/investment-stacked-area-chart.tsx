"use client";

import { useState } from "react";
import { Button } from "@web/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart";
import { prepareStackedAreaChartData, type InvestmentItem } from "@web/features/investments";
import { TimeRange } from "@web/types/time.types";
import { numberToKorean } from "@web/utils/number-format";
import { getTimeRangeLabel } from "@web/utils/time-range-utils";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

interface InvestmentStackedAreaChartProps {
  investments: InvestmentItem[];
}

export function InvestmentStackedAreaChart({ investments }: InvestmentStackedAreaChartProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>(TimeRange.THREE_MONTHS);

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
      {/* Stacked Area 차트 */}
      <div className="w-full">
        <ChartContainer config={config} className="w-full">
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
              hide={true}
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
                    const color = config[name as string]?.color;

                    return (
                      <div className="flex w-full items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-muted-foreground flex-1">{accountName}</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {numberToKorean(value.toString())}
                        </span>
                      </div>
                    );
                  }}
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
      <div className="flex gap-1 justify-center flex-wrap">
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
            variant={selectedRange === range ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSelectedRange(range)}
            className="text-xs"
            aria-selected={selectedRange === range}
          >
            {getTimeRangeLabel(range)}
          </Button>
        ))}
      </div>
    </div>
  );
}
