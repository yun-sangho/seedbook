import { InvestmentItem } from "../../investments/types/types";
import { LoanItem } from "../../loans/types/types";
import { RealAssetItem } from "../../real-assets/types/types";
import { SavingsItem } from "../../savings/types/types";

// 자산 타입별 색상 enum
export enum AssetColor {
  // 주요 자산 타입별 색상
  SAVINGS = "#3B82F6", // blue-500 (저축)
  INVESTMENT = "#10B981", // emerald-500 (투자)
  REAL_ASSET = "#F59E0B", // amber-500 (실물자산)
  LOAN = "#EF4444", // red-500 (대출)

  // 서브 아이템 색상
  SUB_1 = "#6366F1", // indigo-500
  SUB_2 = "#EC4899", // pink-500
  SUB_3 = "#8B5CF6", // violet-500
  SUB_4 = "#F97316", // orange-500
  SUB_5 = "#14B8A6", // teal-500
  SUB_6 = "#D946EF", // fuchsia-500
}

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

// 자산 유형 식별자
export enum AssetCategory {
  SAVINGS = "savings",
  INVESTMENT = "investment",
  REAL_ASSET = "realAsset",
  LOAN = "loan",
}

// 차트 색상 배열 - enum 값을 사용
const CHART_COLORS = [
  AssetColor.SAVINGS,
  AssetColor.INVESTMENT,
  AssetColor.REAL_ASSET,
  AssetColor.LOAN,
  AssetColor.SUB_1,
  AssetColor.SUB_2,
  AssetColor.SUB_3,
  AssetColor.SUB_4,
  AssetColor.SUB_5,
  AssetColor.SUB_6,
];

/**
 * 저축 항목에 대한 차트 데이터를 생성합니다.
 */
export function prepareSavingsChartData(savings: SavingsItem[]): ChartData[] {
  const validSavings = savings.filter((item) => item.balance > 0);

  return validSavings.map((item, index) => ({
    name: item.accountName,
    amount: item.balance,
    color: CHART_COLORS[(index + 4) % CHART_COLORS.length] || AssetColor.SAVINGS,
  }));
}

/**
 * 투자 항목에 대한 차트 데이터를 생성합니다.
 */
export function prepareInvestmentChartData(investments: InvestmentItem[]): ChartData[] {
  const validInvestments = investments.filter((item) => item.currentValue > 0);

  return validInvestments.map((item, index) => ({
    name: item.accountName,
    amount: item.currentValue,
    color: CHART_COLORS[(index + 5) % CHART_COLORS.length] || AssetColor.INVESTMENT,
  }));
}

/**
 * 실물자산 항목에 대한 차트 데이터를 생성합니다.
 */
export function prepareRealAssetChartData(realAssets: RealAssetItem[]): ChartData[] {
  const validRealAssets = realAssets.filter((item) => item.currentValue > 0);

  return validRealAssets.map((item, index) => ({
    name: item.assetName,
    amount: item.currentValue,
    color: CHART_COLORS[(index + 6) % CHART_COLORS.length] || AssetColor.REAL_ASSET,
  }));
}

/**
 * 대출 항목에 대한 차트 데이터를 생성합니다.
 */
export function prepareLoanChartData(loans: LoanItem[]): ChartData[] {
  const validLoans = loans.filter((item) => item.amount > 0);

  return validLoans.map((item, index) => ({
    name: item.loanName,
    amount: item.amount,
    color: CHART_COLORS[(index + 7) % CHART_COLORS.length] || AssetColor.LOAN,
  }));
}

/**
 * 자산 데이터를 총괄 차트로 표시할 수 있는 형식으로 준비합니다.
 * 이 함수는 메인 차트에서만 사용됩니다.
 */
export function prepareAssetsChartData(
  savings: SavingsItem[],
  investments: InvestmentItem[],
  realAssets: RealAssetItem[],
  loans: LoanItem[]
): AssetType[] {
  // 유효한 항목만 필터링
  const validSavings = savings.filter((item) => item.balance > 0);
  const validInvestments = investments.filter((item) => item.currentValue > 0);
  const validRealAssets = realAssets.filter((item) => item.currentValue > 0);
  const validLoans = loans.filter((item) => item.amount > 0);

  // 총 금액 계산
  const totalSavings = validSavings.reduce((sum, item) => sum + item.balance, 0);
  const totalInvestments = validInvestments.reduce((sum, item) => sum + item.currentValue, 0);
  const totalRealAssets = validRealAssets.reduce((sum, item) => sum + item.currentValue, 0);
  const totalLoans = validLoans.reduce((sum, item) => sum + item.amount, 0);

  // 각 자산 유형별 서브 차트 데이터 준비
  const savingsItems = prepareSavingsChartData(savings);
  const investmentItems = prepareInvestmentChartData(investments);
  const realAssetItems = prepareRealAssetChartData(realAssets);
  const loanItems = prepareLoanChartData(loans);

  // 자산 유형별 데이터 구성
  return [
    {
      name: "저축",
      amount: totalSavings,
      color: AssetColor.SAVINGS,
      items: savingsItems,
    },
    {
      name: "투자",
      amount: totalInvestments,
      color: AssetColor.INVESTMENT,
      items: investmentItems,
    },
    {
      name: "실물자산",
      amount: totalRealAssets,
      color: AssetColor.REAL_ASSET,
      items: realAssetItems,
    },
    {
      name: "대출",
      amount: totalLoans,
      color: AssetColor.LOAN,
      items: loanItems,
      isNegative: true, // 대출은 부채이므로 음수 값을 가짐
    },
  ];
}

/**
 * 단일 자산 유형에 대한 차트 데이터를 생성합니다.
 * 각 자산 페이지의 상세 차트에서 사용할 수 있습니다.
 */
export function prepareSingleAssetTypeChartData(
  assetCategory: AssetCategory,
  savings?: SavingsItem[],
  investments?: InvestmentItem[],
  realAssets?: RealAssetItem[],
  loans?: LoanItem[]
): ChartData[] {
  switch (assetCategory) {
    case AssetCategory.SAVINGS:
      return savings ? prepareSavingsChartData(savings) : [];
    case AssetCategory.INVESTMENT:
      return investments ? prepareInvestmentChartData(investments) : [];
    case AssetCategory.REAL_ASSET:
      return realAssets ? prepareRealAssetChartData(realAssets) : [];
    case AssetCategory.LOAN:
      return loans ? prepareLoanChartData(loans) : [];
    default:
      return [];
  }
}

/**
 * 단일 자산 타입의 합계 금액을 계산합니다.
 */
export function calculateAssetTypeTotal(
  assetCategory: AssetCategory,
  savings?: SavingsItem[],
  investments?: InvestmentItem[],
  realAssets?: RealAssetItem[],
  loans?: LoanItem[]
): number {
  switch (assetCategory) {
    case AssetCategory.SAVINGS:
      return savings
        ? savings.filter((item) => item.balance > 0).reduce((sum, item) => sum + item.balance, 0)
        : 0;
    case AssetCategory.INVESTMENT:
      return investments
        ? investments
            .filter((item) => item.currentValue > 0)
            .reduce((sum, item) => sum + item.currentValue, 0)
        : 0;
    case AssetCategory.REAL_ASSET:
      return realAssets
        ? realAssets
            .filter((item) => item.currentValue > 0)
            .reduce((sum, item) => sum + item.currentValue, 0)
        : 0;
    case AssetCategory.LOAN:
      return loans
        ? loans.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0)
        : 0;
    default:
      return 0;
  }
}
