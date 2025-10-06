"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import {
  ASSET_PROGRESS_VIEW_LABELS,
  type AssetProgressPoint,
  type AssetProgressView,
} from "@web/features/assets/types/progress";
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

interface AssetProgressChartProps {
  progressPoints: AssetProgressPoint[];
  selectedView: AssetProgressView;
  onViewChange: (view: AssetProgressView) => void;
}

export function AssetProgressChart({
  progressPoints,
  selectedView,
  onViewChange,
}: AssetProgressChartProps) {
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{ASSET_PROGRESS_VIEW_LABELS[selectedView]} 추이</CardTitle>
          <Select value={selectedView} onValueChange={(v) => onViewChange(v as AssetProgressView)}>
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
  );
}
