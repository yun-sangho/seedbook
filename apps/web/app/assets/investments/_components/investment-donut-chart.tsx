"use client";

import { useMemo } from "react";
import { ChartTooltip } from "@web/components/ui/chart";
import { numberToKorean, truncateToHighestDenomination } from "@web/utils/number-format";
import { Cell, Label, Pie, PieChart, ResponsiveContainer } from "recharts";

interface InvestmentChartProps {
  data: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  totalAmount: string;
}

export function InvestmentDonutChart({ data, totalAmount }: InvestmentChartProps) {
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
        {truncateToHighestDenomination(formattedTotal)}
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={350}>
      <PieChart>
        <ChartTooltip cursor={false} />
        <Pie data={data} innerRadius={70} dataKey="value" nameKey={"name"}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
          <Label content={renderCenterText} position="center" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
