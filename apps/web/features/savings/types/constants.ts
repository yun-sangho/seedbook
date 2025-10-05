/**
 * 저축 계좌 카테고리 열거형
 */
export enum SavingsCategory {
  CHECKING = "입출금",
  DEPOSIT = "예적금",
  HOUSING = "주택청약",
}

/**
 * 입출금 카테고리 계좌 타입
 */
export enum CheckingAccountType {
  CHECKING = "입출금",
}

/**
 * 예적금 카테고리 계좌 타입
 */
export enum DepositAccountType {
  SAVINGS_DEPOSIT = "저축", // 정기저축
  INSTALLMENT_SAVINGS = "적금", // 정기적금
}

/**
 * 주택청약 카테고리 계좌 타입
 */
export enum HousingAccountType {
  HOUSING_SUBSCRIPTION = "주택청약", // 주택청약종합저축
}

/**
 * @deprecated Use SavingsCategory instead
 */
export enum SavingsAccountType {
  CHECKING = "입출금",
  DEPOSIT = "예적금",
  HOUSING = "주택청약",
}

/**
 * 통화 유형 열거형
 */
export enum CurrencyType {
  KRW = "원",
}

/**
 * 계좌 소유자 열거형 (기본 값)
 */
export enum DefaultOwnerType {
  SELF = "본인",
  SPOUSE = "배우자",
}

/**
 * 저축 계좌 유형 목록
 */
export const SAVINGS_ACCOUNT_TYPES = Object.values(SavingsAccountType);

/**
 * 통화 옵션 목록
 */
export const CURRENCY_OPTIONS = Object.values(CurrencyType);

/**
 * 기본 계좌 소유자 목록
 */
export const DEFAULT_OWNERS = Object.values(DefaultOwnerType);

/**
 * 카테고리별 계좌 타입 그룹
 */
export const ACCOUNT_TYPES_BY_CATEGORY = {
  [SavingsCategory.CHECKING]: Object.values(CheckingAccountType),
  [SavingsCategory.DEPOSIT]: Object.values(DepositAccountType),
  [SavingsCategory.HOUSING]: Object.values(HousingAccountType),
} as const;

/**
 * 계좌 카테고리 목록
 */
export const SAVINGS_CATEGORIES = Object.values(SavingsCategory);

/**
 * 저축 계좌별 차트 색상 팔레트 (30가지)
 * 6가지 기본 색상 × 5단계 명도로 구성하여 시각적 구분 최대화
 *
 * 기본 색상: Red, Yellow, Green, Cyan, Blue, Purple
 * 각 색상당 5단계: 400, 500, 600, 700, 800
 */
export const ACCOUNT_COLORS = [
  // Red 계열 (빨강) - 5단계
  "#f87171", // red-400
  "#ef4444", // red-500
  "#dc2626", // red-600
  "#b91c1c", // red-700
  "#991b1b", // red-800

  // Yellow 계열 (노랑) - 5단계
  "#facc15", // yellow-400
  "#eab308", // yellow-500
  "#ca8a04", // yellow-600
  "#a16207", // yellow-700
  "#854d0e", // yellow-800

  // Green 계열 (초록) - 5단계
  "#4ade80", // green-400
  "#22c55e", // green-500
  "#16a34a", // green-600
  "#15803d", // green-700
  "#166534", // green-800

  // Cyan 계열 (청록) - 5단계
  "#22d3ee", // cyan-400
  "#06b6d4", // cyan-500
  "#0891b2", // cyan-600
  "#0e7490", // cyan-700
  "#155e75", // cyan-800

  // Blue 계열 (파랑) - 5단계
  "#60a5fa", // blue-400
  "#3b82f6", // blue-500
  "#2563eb", // blue-600
  "#1d4ed8", // blue-700
  "#1e40af", // blue-800

  // Purple 계열 (보라) - 5단계
  "#c084fc", // purple-400
  "#a855f7", // purple-500
  "#9333ea", // purple-600
  "#7e22ce", // purple-700
  "#6b21a8", // purple-800
];

/**
 * 색상 계열 분류 (6개 그룹)
 * 각 계열당 5가지 색상 (명도 차이)
 */
export const COLOR_FAMILIES = {
  RED: ACCOUNT_COLORS.slice(0, 5), // 빨강 계열
  YELLOW: ACCOUNT_COLORS.slice(5, 10), // 노랑 계열
  GREEN: ACCOUNT_COLORS.slice(10, 15), // 초록 계열
  CYAN: ACCOUNT_COLORS.slice(15, 20), // 청록 계열
  BLUE: ACCOUNT_COLORS.slice(20, 25), // 파랑 계열
  PURPLE: ACCOUNT_COLORS.slice(25, 30), // 보라 계열
} as const;

/**
 * 색상이 속한 계열 이름 반환
 */
export function getColorFamily(color: string): string | null {
  for (const [familyName, colors] of Object.entries(COLOR_FAMILIES)) {
    if (colors.includes(color)) {
      return familyName;
    }
  }
  return null;
}
