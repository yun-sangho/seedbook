import type { SavingsItem } from "@web/features/savings/types/types";
import { TimeRange } from "@web/types/time.consts";
import { getDateRange } from "@web/utils/time-range-utils";

// 각 계좌별 차트 데이터 포인트 인터페이스
export interface SavingsAccountChartData {
  date: string;
  dateFormatted: string;
  [accountKey: string]: number | string; // 동적으로 계좌별 값들이 추가됨
}

// 특정 날짜에서 계좌의 잔액을 추정하는 함수
function getAccountBalanceAtDate(savings: SavingsItem, targetDate: string): number {
  const targetDateTime = new Date(targetDate).getTime();

  // 해당 날짜에 정확히 맞는 기록들을 모두 찾음
  const exactRecords = savings.records.filter((record) => record.date === targetDate);

  if (exactRecords.length > 0) {
    // 같은 날짜에 여러 기록이 있으면 마지막 기록을 사용
    const lastRecord = exactRecords[exactRecords.length - 1];
    return lastRecord ? lastRecord.balance : 0;
  }

  // 정확한 날짜 기록이 없는 경우, 해당 날짜 이전의 가장 최근 기록을 찾음
  let latestRecord: SavingsItem["records"][0] | null = null;
  let latestRecordTime = 0;

  savings.records.forEach((record) => {
    const recordTime = new Date(record.date).getTime();

    if (recordTime <= targetDateTime && recordTime > latestRecordTime) {
      latestRecord = record;
      latestRecordTime = recordTime;
    }
  });

  // 이전 기록이 있는 경우 그 값을 사용
  if (latestRecord) {
    return (latestRecord as { balance: number }).balance;
  }

  // 해당 날짜 이전에 기록이 없는 경우 0 반환
  return 0;
}

// 계좌별 stacked area 차트 데이터를 준비하는 함수
export function prepareSavingsStackedAreaChartData(
  savings: SavingsItem[],
  timeRange: TimeRange
): {
  data: SavingsAccountChartData[];
  config: Record<string, { label: string; color: string }>;
} {
  const startDate = getDateRange(timeRange);
  const now = new Date();

  // 히스토리가 없는 계좌 제외
  const savingsWithHistory = savings.filter((savingsItem) => savingsItem.records.length > 0);

  if (savingsWithHistory.length === 0) {
    return { data: [], config: {} };
  }

  // 모든 기록의 날짜를 수집하고 시간 범위 내로 필터링 (미래 날짜 제외)
  const allDates = new Set<string>();

  savingsWithHistory.forEach((savingsItem) => {
    savingsItem.records.forEach((record) => {
      const recordDate = new Date(record.date);
      if (recordDate >= startDate && recordDate <= now) {
        allDates.add(record.date);
      }
    });
  });

  // 날짜별로 각 계좌의 잔액을 계산
  const chartData: SavingsAccountChartData[] = Array.from(allDates)
    .map((date) => {
      const dataPoint: SavingsAccountChartData = {
        date,
        dateFormatted: new Date(date).toLocaleDateString("ko-KR", {
          month: "short",
          day: "numeric",
        }),
      };

      savingsWithHistory.forEach((savingsItem) => {
        const accountKey = `account_${savingsItem.id}`;
        const balanceAtDate = getAccountBalanceAtDate(savingsItem, date);
        dataPoint[accountKey] = balanceAtDate;
      });

      return dataPoint;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 차트 설정 생성
  const config: Record<string, { label: string; color: string }> = {};
  savingsWithHistory.forEach((savingsItem) => {
    const accountKey = `account_${savingsItem.id}`;
    config[accountKey] = {
      label: savingsItem.accountName,
      color: savingsItem.color, // 계좌별로 저장된 색상 사용
    };
  });

  return { data: chartData, config };
}
