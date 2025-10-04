import { InvestmentItem } from "@web/features/investments/types/types";
import { TimeRange } from "@web/utils/investment-chart-utils";

// 각 계좌별 차트 데이터 포인트 인터페이스
export interface AccountChartData {
  date: string;
  dateFormatted: string;
  [accountKey: string]: number | string; // 동적으로 계좌별 값들이 추가됨
}

// 색상 팔레트
const COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#84cc16", // lime-500
  "#f97316", // orange-500
  "#ec4899", // pink-500
  "#6366f1", // indigo-500
];

// 날짜를 필터링하는 함수
function getDateRange(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case TimeRange.ONE_MONTH:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case TimeRange.THREE_MONTHS:
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case TimeRange.ONE_YEAR:
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case TimeRange.FIVE_YEARS:
      return new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
    case TimeRange.TEN_YEARS:
      return new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
    case TimeRange.ALL:
      return new Date(0); // 1970-01-01부터 모든 데이터
    default:
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
}

// 특정 날짜에서 계좌의 평가금액을 추정하는 함수
function getAccountValueAtDate(investment: InvestmentItem, targetDate: string): number {
  const targetDateTime = new Date(targetDate).getTime();

  // 해당 날짜에 정확히 맞는 기록들을 모두 찾음
  const exactRecords = investment.records.filter((record) => record.date === targetDate);

  if (exactRecords.length > 0) {
    // 같은 날짜에 여러 기록이 있으면 마지막 기록을 사용
    const lastRecord = exactRecords[exactRecords.length - 1];
    return lastRecord ? lastRecord.currentValue : 0;
  }

  // 정확한 날짜 기록이 없는 경우, 해당 날짜 이전의 가장 최근 기록을 찾음
  let latestRecord: InvestmentItem["records"][0] | null = null;
  let latestRecordTime = 0;

  investment.records.forEach((record) => {
    const recordTime = new Date(record.date).getTime();

    if (recordTime <= targetDateTime && recordTime > latestRecordTime) {
      latestRecord = record;
      latestRecordTime = recordTime;
    }
  });

  // 이전 기록이 있는 경우 그 값을 사용
  if (latestRecord) {
    return (latestRecord as { currentValue: number }).currentValue;
  }

  // 해당 날짜 이전에 기록이 없는 경우 0 반환
  return 0;
}

// 계좌별 stacked area 차트 데이터를 준비하는 함수
export function prepareStackedAreaChartData(
  investments: InvestmentItem[],
  timeRange: TimeRange
): { data: AccountChartData[]; config: Record<string, { label: string; color: string }> } {
  const startDate = getDateRange(timeRange);
  const now = new Date();

  // 히스토리가 없는 계좌 제외
  const investmentsWithHistory = investments.filter((investment) => investment.records.length > 0);

  if (investmentsWithHistory.length === 0) {
    return { data: [], config: {} };
  }

  // 모든 기록의 날짜를 수집하고 시간 범위 내로 필터링 (미래 날짜 제외)
  const allDates = new Set<string>();

  investmentsWithHistory.forEach((investment) => {
    investment.records.forEach((record) => {
      const recordDate = new Date(record.date);
      if (recordDate >= startDate && recordDate <= now) {
        allDates.add(record.date);
      }
    });
  });

  // 날짜별로 각 계좌의 평가금액을 계산
  const chartData: AccountChartData[] = Array.from(allDates)
    .map((date) => {
      const dataPoint: AccountChartData = {
        date,
        dateFormatted: new Date(date).toLocaleDateString("ko-KR", {
          month: "short",
          day: "numeric",
        }),
      };

      investmentsWithHistory.forEach((investment) => {
        const accountKey = `account_${investment.id}`;
        const valueAtDate = getAccountValueAtDate(investment, date);
        dataPoint[accountKey] = valueAtDate;
      });

      return dataPoint;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 차트 설정 생성
  const config: Record<string, { label: string; color: string }> = {};
  investmentsWithHistory.forEach((investment, index) => {
    const accountKey = `account_${investment.id}`;
    config[accountKey] = {
      label: investment.accountName,
      color: COLORS[index % COLORS.length] || "#6b7280",
    };
  });

  return { data: chartData, config };
}
