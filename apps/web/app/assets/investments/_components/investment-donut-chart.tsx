"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Text } from "recharts";
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
    // 텍스트 길이에 따라 다른 표시 방법을 적용
    if (formattedTotal.length > 8) {
      const firstPart = formattedTotal.substring(0, formattedTotal.length / 2);
      const secondPart = formattedTotal.substring(formattedTotal.length / 2);

      return (
        <>
          <Text
            x="50%"
            y="45%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-current font-medium"
          >
            {firstPart}
          </Text>
          <Text
            x="50%"
            y="55%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-current font-medium"
          >
            {secondPart}
          </Text>
        </>
      );
    } else {
      return (
        <Text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-current font-medium"
        >
          {formattedTotal}
        </Text>
      );
    }
  };

  return (
    <ResponsiveContainer width="100%" height={350}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        {renderCenterText()}
      </PieChart>
    </ResponsiveContainer>
  );
}
