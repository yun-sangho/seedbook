import type { SavingsItem } from "../types/types";

/**
 * 시간 범위 열거형
 */
export enum TimeRange {
  ONE_MONTH = "1month",
  THREE_MONTHS = "3months",
  ONE_YEAR = "1year",
  FIVE_YEARS = "5years",
  TEN_YEARS = "10years",
  ALL = "all",
}

/**
 * 차트 데이터 인터페이스
 */
export interface SavingsChartData {
  date: string; // YYYY-MM-DD
  dateFormatted: string; // "7월 15일"
  balance: number; // 잔액 (만원 단위)
}

/**
 * 시간 범위에 따른 일수 반환
 */
const getTimeRangeDays = (timeRange: TimeRange): number | null => {
  switch (timeRange) {
    case TimeRange.ONE_MONTH:
      return 30;
    case TimeRange.THREE_MONTHS:
      return 90;
    case TimeRange.ONE_YEAR:
      return 365;
    case TimeRange.FIVE_YEARS:
      return 1825;
    case TimeRange.TEN_YEARS:
      return 3650;
    case TimeRange.ALL:
      return null; // 전체
    default:
      return null;
  }
};

/**
 * 날짜를 한국어 형식으로 포맷 ("7월 15일")
 */
const formatDateToKorean = (dateString: string): string => {
  const date = new Date(dateString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}월 ${day}일`;
};

/**
 * 저축 히스토리를 차트 데이터로 변환
 *
 * @param savings - 저축 계좌 배열
 * @param timeRange - 시간 범위 필터
 * @returns 차트 데이터 포인트 배열
 */
export function prepareSavingsChartData(
  savings: SavingsItem[],
  timeRange: TimeRange = TimeRange.ALL
): SavingsChartData[] {
  // 빈 배열 처리
  if (!savings || savings.length === 0) {
    return [];
  }

  const today = new Date();
  const rangeDays = getTimeRangeDays(timeRange);
  const cutoffDate =
    rangeDays !== null ? new Date(today.getTime() - rangeDays * 24 * 60 * 60 * 1000) : null;

  // 날짜별 잔액 집계를 위한 Map
  const dateMap = new Map<string, number>();

  // 모든 계좌의 히스토리 수집
  savings.forEach((account) => {
    if (!account.records || account.records.length === 0) {
      return; // 히스토리 없으면 스킵
    }

    account.records.forEach((record) => {
      const recordDate = new Date(record.date);

      // 미래 날짜 제외
      if (recordDate > today) {
        return;
      }

      // 시간 범위 필터링
      if (cutoffDate && recordDate < cutoffDate) {
        return;
      }

      const dateKey = record.date;
      const currentBalance = dateMap.get(dateKey) || 0;
      dateMap.set(dateKey, currentBalance + record.balance);
    });
  });

  // Map을 배열로 변환
  const chartData: SavingsChartData[] = Array.from(dateMap.entries()).map(([date, balance]) => ({
    date,
    dateFormatted: formatDateToKorean(date),
    balance,
  }));

  // 날짜순 정렬 (오래된 순)
  chartData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return chartData;
}
