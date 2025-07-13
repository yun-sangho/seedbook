import { InvestmentItem } from "../types/types";

/**
 * 차트에서 사용할 색상 배열
 */
export const chartColors: string[] = [
  "rgba(54, 162, 235, 0.8)",
  "rgba(255, 99, 132, 0.8)",
  "rgba(255, 206, 86, 0.8)",
  "rgba(75, 192, 192, 0.8)",
  "rgba(153, 102, 255, 0.8)",
  "rgba(255, 159, 64, 0.8)",
  "rgba(199, 199, 199, 0.8)",
  "rgba(83, 102, 255, 0.8)",
  "rgba(40, 159, 64, 0.8)",
  "rgba(210, 199, 199, 0.8)",
];

/**
 * 투자 데이터를 차트에서 사용할 형식으로 변환하는 함수
 */
export function prepareChartData(investments: InvestmentItem[]): Array<{
  name: string;
  value: number;
  color: string;
}> {
  const filteredAndSorted = investments
    .filter((item) => item.currentValue)
    .sort((a, b) => b.currentValue - a.currentValue);

  return filteredAndSorted.map((item, index) => {
    // 색상 배열 인덱스가 범위를 벗어나면 기본 색상 사용
    const colorIndex = index % chartColors.length;
    const color = chartColors[colorIndex] || "rgba(128, 128, 128, 0.8)"; // 기본 회색

    return {
      name: item.accountName,
      value: item.currentValue,
      color: color,
    };
  });
}
