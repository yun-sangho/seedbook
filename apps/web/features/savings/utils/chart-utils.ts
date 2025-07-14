import { SavingsItem } from "../types/types";

// 차트 데이터 인터페이스
export interface ChartData {
  accountName: string;
  amount: number;
  color: string;
}

// 차트 색상 배열
const CHART_COLORS = [
  "#3B82F6", // blue-500
  "#10B981", // emerald-500
  "#F59E0B", // amber-500
  "#6366F1", // indigo-500
  "#EC4899", // pink-500
  "#8B5CF6", // violet-500
  "#EF4444", // red-500
  "#F97316", // orange-500
  "#14B8A6", // teal-500
  "#D946EF", // fuchsia-500
];

/**
 * 저축 데이터를 차트에 표시할 수 있는 형식으로 준비합니다.
 */
export function prepareChartData(savings: SavingsItem[]): ChartData[] {
  // 금액이 있는 계좌만 필터링
  const validAccounts = savings.filter((item) => item.amount > 0);

  return validAccounts.map((item, index) => ({
    accountName: item.accountName,
    amount: item.amount,
    color: CHART_COLORS[index % CHART_COLORS.length] || "#3B82F6", // 기본색상 추가
  }));
}
