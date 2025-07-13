"use client";

import { useMemo } from "react";
import { ChartTooltip } from "@web/components/ui/chart";
import { Cell, Label, Pie, PieChart, ResponsiveContainer, Text } from "recharts";
import { numberToKorean } from "../_utils/number-format";

interface InvestmentChartProps {
  data: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  totalAmount: string;
}

export function InvestmentDonutChart({ data, totalAmount }: InvestmentChartProps) {
  // 총 금액 표시를 위한 메모이제이션
  const formattedTotal = useMemo(() => {
    return numberToKorean(totalAmount);
  }, [totalAmount]);

  // 금액이 길어질 경우 줄바꿈 처리를 위한 로직
  const renderCenterText = () => {
    return (
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-current font-medium"
      >
        {formattedTotal}
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={350}>
      <PieChart>
        <ChartTooltip cursor={false} />
        <Pie data={data} innerRadius={70} dataKey="value" nameKey={"name"} strokeWidth={5}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
          <Label content={renderCenterText} position="center" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
