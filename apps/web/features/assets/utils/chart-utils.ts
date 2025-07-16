import { InvestmentItem } from "../../investments/types/types";
import { LoanItem } from "../../loans/types/types";
import { RealAssetItem } from "../../real-assets/types/types";
import { SavingsItem } from "../../savings/types/types";

// 차트 데이터 인터페이스
export interface ChartData {
  name: string;
  amount: number;
  color: string;
}

// 자산 유형 인터페이스
export interface AssetType {
  name: string;
  amount: number;
  color: string;
  items: ChartData[];
  isNegative?: boolean; // 대출처럼 음수 값을 가질 수 있는지 여부
}

// 차트 색상 배열
const CHART_COLORS = [
  "#3B82F6", // blue-500 (저축)
  "#10B981", // emerald-500 (투자)
  "#F59E0B", // amber-500 (실물자산)
  "#EF4444", // red-500 (대출)
  "#6366F1", // indigo-500
  "#EC4899", // pink-500
  "#8B5CF6", // violet-500
  "#F97316", // orange-500
  "#14B8A6", // teal-500
  "#D946EF", // fuchsia-500
];

/**
 * 자산 데이터를 총괄 차트로 표시할 수 있는 형식으로 준비합니다.
 */
export function prepareAssetsChartData(
  savings: SavingsItem[],
  investments: InvestmentItem[],
  realAssets: RealAssetItem[],
  loans: LoanItem[]
): AssetType[] {
  // 유효한 항목만 필터링
  const validSavings = savings.filter((item) => item.amount > 0);
  const validInvestments = investments.filter((item) => item.currentValue > 0);
  const validRealAssets = realAssets.filter((item) => item.currentValue > 0);
  const validLoans = loans.filter((item) => item.amount > 0);

  // 총 금액 계산
  const totalSavings = validSavings.reduce((sum, item) => sum + item.amount, 0);
  const totalInvestments = validInvestments.reduce((sum, item) => sum + item.currentValue, 0);
  const totalRealAssets = validRealAssets.reduce((sum, item) => sum + item.currentValue, 0);
  const totalLoans = validLoans.reduce((sum, item) => sum + item.amount, 0);

  // 저축 계좌의 차트 데이터 준비
  const savingsItems = validSavings.map((item, index) => ({
    name: item.accountName,
    amount: item.amount,
    color: CHART_COLORS[(index + 4) % CHART_COLORS.length] || "#3B82F6",
  }));

  // 투자 계좌의 차트 데이터 준비
  const investmentItems = validInvestments.map((item, index) => ({
    name: item.accountName,
    amount: item.currentValue,
    color: CHART_COLORS[(index + 5) % CHART_COLORS.length] || "#10B981",
  }));

  // 실물자산의 차트 데이터 준비
  const realAssetItems = validRealAssets.map((item, index) => ({
    name: item.assetName,
    amount: item.currentValue,
    color: CHART_COLORS[(index + 6) % CHART_COLORS.length] || "#F59E0B",
  }));

  // 대출의 차트 데이터 준비
  const loanItems = validLoans.map((item, index) => ({
    name: item.loanName,
    amount: item.amount,
    color: CHART_COLORS[(index + 7) % CHART_COLORS.length] || "#EF4444",
  }));

  // 자산 유형별 데이터 구성
  return [
    {
      name: "저축",
      amount: totalSavings,
      color: CHART_COLORS[0] || "#3B82F6",
      items: savingsItems,
    },
    {
      name: "투자",
      amount: totalInvestments,
      color: CHART_COLORS[1] || "#10B981",
      items: investmentItems,
    },
    {
      name: "실물자산",
      amount: totalRealAssets,
      color: CHART_COLORS[2] || "#F59E0B",
      items: realAssetItems,
    },
    {
      name: "대출",
      amount: totalLoans,
      color: CHART_COLORS[3] || "#EF4444",
      items: loanItems,
      isNegative: true, // 대출은 부채이므로 음수 값을 가짐
    },
  ];
}
