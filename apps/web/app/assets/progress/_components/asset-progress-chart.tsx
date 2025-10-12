"use client";

import { useMemo, useState } from "react";
import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader } from "@web/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@web/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import {
  ASSET_PROGRESS_VIEW_LABELS,
  type AssetProgressPoint,
  type AssetProgressView,
} from "@web/features/assets/types/progress";
import { TimeRange } from "@web/types/time.consts";
import { numberToKorean } from "@web/utils/number-format";
import { getDateRange, getTimeRangeLabel } from "@web/utils/time-range-utils";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

interface AssetProgressChartProps {
  progressPoints: AssetProgressPoint[];
}

export function AssetProgressChart({ progressPoints }: AssetProgressChartProps) {
  const [selectedView, setSelectedView] = useState<AssetProgressView>("netAssets");
  const [selectedRange, setSelectedRange] = useState<TimeRange>(TimeRange.ALL);

  // 날짜 범위에 따라 progressPoints 필터링
  const filteredPoints = useMemo(() => {
    if (selectedRange === TimeRange.ALL) {
      return progressPoints;
    }

    const cutoffDate = getDateRange(selectedRange);
    return progressPoints.filter((point) => {
      const pointDate = new Date(point.date);
      return pointDate >= cutoffDate;
    });
  }, [progressPoints, selectedRange]);

  // 차트 데이터 준비
  const chartData = useMemo(() => {
    return filteredPoints.map((point, index) => {
      const date = new Date(point.date);
      const dateFormatted = isNaN(date.getTime())
        ? point.date
        : date.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });

      const currentValue = point[selectedView];
      const previousValue = index > 0 ? (filteredPoints[index - 1]?.[selectedView] ?? 0) : 0;
      const change = index > 0 ? currentValue - previousValue : 0;
      const changePercent = index > 0 && previousValue !== 0 ? (change / previousValue) * 100 : 0;

      return {
        date: point.date,
        value: currentValue,
        previousValue,
        change,
        changePercent,
        dateFormatted,
        // 모든 뷰의 값 포함
        totalAssets: point.totalAssets,
        netAssets: point.netAssets,
        loans: point.loans,
      };
    });
  }, [filteredPoints, selectedView]);

  // 통계 계산
  const stats = useMemo(() => {
    if (filteredPoints.length === 0) {
      return {
        current: 0,
        initial: 0,
        change: 0,
        changePercent: 0,
      };
    }

    const latest = filteredPoints[filteredPoints.length - 1];
    const first = filteredPoints[0];

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
  }, [filteredPoints, selectedView]);

  // ChartConfig 정의
  const chartConfig: ChartConfig = {
    value: {
      label: ASSET_PROGRESS_VIEW_LABELS[selectedView],
    },
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          {/* <CardTitle>{ASSET_PROGRESS_VIEW_LABELS[selectedView]} 추이</CardTitle> */}
          <Tabs value={selectedView} onValueChange={(v) => setSelectedView(v as AssetProgressView)}>
            <TabsList>
              {Object.entries(ASSET_PROGRESS_VIEW_LABELS).map(([value, label]) => (
                <TabsTrigger key={value} value={value}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 통계 요약 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">현재 금액</p>
            <p className="text-2xl font-bold">{numberToKorean(stats.current.toString())}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">변화량</p>
            <p
              className={`text-2xl font-bold ${
                stats.change >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {stats.change >= 0 ? "+" : ""}
              {numberToKorean(stats.change.toString())}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">변화율</p>
            <p
              className={`text-2xl font-bold ${
                stats.changePercent >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {stats.changePercent >= 0 ? "+" : ""}
              {stats.changePercent.toFixed(2)}%
            </p>
          </div>
        </div>

        {/* 차트 */}
        {chartData.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center text-gray-500">
            기록된 자산 데이터가 없습니다.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[400px] w-full">
            <LineChart data={chartData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="dateFormatted" hide={true} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => {
                  return numberToKorean(value.toString());
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value, payload) => {
                      if (payload && payload.length > 0) {
                        const data = payload[0]?.payload;
                        return data?.dateFormatted ?? value;
                      }
                      return value;
                    }}
                    formatter={(value, name, item) => {
                      const data = item.payload;
                      const hasChange = data.change !== undefined && data.change !== 0;

                      // 현재 뷰에 따라 보여줄 다른 메트릭 결정
                      const otherMetrics: Array<{ label: string; value: number }> = [];
                      if (selectedView === "totalAssets") {
                        otherMetrics.push(
                          { label: ASSET_PROGRESS_VIEW_LABELS.netAssets, value: data.netAssets },
                          { label: ASSET_PROGRESS_VIEW_LABELS.loans, value: data.loans }
                        );
                      } else if (selectedView === "netAssets") {
                        otherMetrics.push(
                          {
                            label: ASSET_PROGRESS_VIEW_LABELS.totalAssets,
                            value: data.totalAssets,
                          },
                          { label: ASSET_PROGRESS_VIEW_LABELS.loans, value: data.loans }
                        );
                      } else if (selectedView === "loans") {
                        otherMetrics.push(
                          {
                            label: ASSET_PROGRESS_VIEW_LABELS.totalAssets,
                            value: data.totalAssets,
                          },
                          { label: ASSET_PROGRESS_VIEW_LABELS.netAssets, value: data.netAssets }
                        );
                      }

                      return (
                        <div className="flex w-full flex-col gap-2">
                          {/* 현재 값 */}
                          <div className="flex w-full items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: "hsl(var(--chart-1))" }}
                            />
                            <span className="text-muted-foreground flex-1">
                              {ASSET_PROGRESS_VIEW_LABELS[selectedView]}
                            </span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {numberToKorean(value.toString())}
                            </span>
                          </div>

                          {/* 변화량 정보 */}
                          {hasChange && (
                            <div className="flex w-full flex-col gap-1 border-t pt-2">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-xs text-muted-foreground">전 지점 대비</span>
                                <span
                                  className={`text-sm font-semibold tabular-nums ${
                                    data.change >= 0 ? "text-green-600" : "text-red-600"
                                  }`}
                                >
                                  {data.change >= 0 ? "+" : ""}
                                  {numberToKorean(data.change?.toString() ?? "0")}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-xs text-muted-foreground">증감률</span>
                                <span
                                  className={`text-sm font-semibold tabular-nums ${
                                    data.changePercent >= 0 ? "text-green-600" : "text-red-600"
                                  }`}
                                >
                                  {data.changePercent >= 0 ? "+" : ""}
                                  {data.changePercent?.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          )}

                          {/* 다른 메트릭 */}
                          {otherMetrics.length > 0 && (
                            <div className="flex w-full flex-col gap-1 border-t pt-2">
                              {otherMetrics.map((metric) => (
                                <div
                                  key={metric.label}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <span className="text-xs text-muted-foreground">
                                    {metric.label}
                                  </span>
                                  <span className="text-sm tabular-nums text-foreground">
                                    {numberToKorean(metric.value?.toString() ?? "0")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ChartContainer>
        )}

        {/* 날짜 범위 선택 버튼 */}
        <div className="flex gap-1 justify-center flex-wrap pt-4">
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
      </CardContent>
    </Card>
  );
}
