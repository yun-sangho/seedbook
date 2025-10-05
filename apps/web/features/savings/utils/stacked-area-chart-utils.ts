import type { SavingsItem } from "../types/types";
import { TimeRange } from "./savings-chart-utils";

/**
 * 계좌별 차트 데이터 인터페이스
 */
export interface AccountChartData {
  date: string; // YYYY-MM-DD
  dateFormatted: string; // "7월 15일"
  [accountKey: string]: number | string; // 각 계좌의 잔액 (동적 키)
}

/**
 * 차트 설정 인터페이스
 */
export interface ChartConfig {
  [accountKey: string]: {
    label: string; // 계좌명
    color: string; // 색상
  };
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
      return null;
    default:
      return null;
  }
};

/**
 * 날짜를 한국어 형식으로 포맷
 */
const formatDateToKorean = (dateString: string): string => {
  const date = new Date(dateString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}월 ${day}일`;
};

/**
 * 특정 날짜에 계좌의 잔액 추정
 * (해당 날짜 또는 그 이전의 가장 최근 기록 사용)
 */
const getAccountBalanceAtDate = (account: SavingsItem, targetDate: string): number => {
  if (!account.records || account.records.length === 0) {
    return 0;
  }

  // 정확한 날짜 기록 찾기
  const exactRecord = account.records.find((r) => r.date === targetDate);
  if (exactRecord) {
    return exactRecord.balance;
  }

  // 해당 날짜 이전의 가장 최근 기록 찾기
  const previousRecords = account.records
    .filter((r) => r.date < targetDate)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (previousRecords.length > 0 && previousRecords[0]) {
    return previousRecords[0].balance;
  }

  return 0; // 이전 기록도 없으면 0
};

/**
 * Stacked Area Chart용 데이터 준비
 *
 * @param savings - 예금 계좌 배열
 * @param timeRange - 시간 범위
 * @returns data: 날짜별 각 계좌의 잔액, config: 계좌별 설정
 */
export function prepareStackedAreaChartData(
  savings: SavingsItem[],
  timeRange: TimeRange = TimeRange.ALL
): {
  data: AccountChartData[];
  config: ChartConfig;
} {
  // 빈 배열 처리
  if (!savings || savings.length === 0) {
    return { data: [], config: {} };
  }

  const today = new Date();
  const rangeDays = getTimeRangeDays(timeRange);
  const cutoffDate =
    rangeDays !== null ? new Date(today.getTime() - rangeDays * 24 * 60 * 60 * 1000) : null;

  // 히스토리가 있는 계좌만 필터링
  const validSavings = savings.filter((s) => s.records && s.records.length > 0);

  if (validSavings.length === 0) {
    return { data: [], config: {} };
  }

  // 모든 고유 날짜 수집
  const allDatesSet = new Set<string>();
  validSavings.forEach((account) => {
    account.records?.forEach((record) => {
      const recordDate = new Date(record.date);

      // 미래 날짜 제외
      if (recordDate > today) {
        return;
      }

      // 시간 범위 필터링
      if (cutoffDate && recordDate < cutoffDate) {
        return;
      }

      allDatesSet.add(record.date);
    });
  });

  // 날짜 배열로 변환 및 정렬
  const allDates = Array.from(allDatesSet).sort();

  if (allDates.length === 0) {
    return { data: [], config: {} };
  }

  // 차트 설정 (계좌별 이름과 색상)
  const config: ChartConfig = {};
  validSavings.forEach((account) => {
    const accountKey = `account_${account.id}`;
    config[accountKey] = {
      label: account.accountName,
      color: account.color,
    };
  });

  // 날짜별 데이터 생성
  const data: AccountChartData[] = allDates.map((date) => {
    const row: AccountChartData = {
      date,
      dateFormatted: formatDateToKorean(date),
    };

    // 각 계좌의 해당 날짜 잔액 추정
    validSavings.forEach((account) => {
      const accountKey = `account_${account.id}`;
      row[accountKey] = getAccountBalanceAtDate(account, date);
    });

    return row;
  });

  return { data, config };
}
