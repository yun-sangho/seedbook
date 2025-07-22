import { InvestmentItem } from "@web/features/investments/types/types";

// 시간 범위 타입
export type TimeRange = "30days" | "3months" | "1year";

// 차트 데이터 포인트 인터페이스
export interface InvestmentChartData {
  date: string;
  totalValue: number;
  dateFormatted: string;
}

// 날짜를 필터링하는 함수
function getDateRange(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case "30days":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "3months":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "1year":
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

// 투자 히스토리를 차트 데이터로 변환하는 함수
export function prepareInvestmentChartData(
  investments: InvestmentItem[],
  timeRange: TimeRange
): InvestmentChartData[] {
  const startDate = getDateRange(timeRange);
  const now = new Date();

  // 히스토리가 없는 계좌 제외
  const investmentsWithHistory = investments.filter((investment) => investment.records.length > 0);

  if (investmentsWithHistory.length === 0) {
    return [];
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

  // 날짜별로 각 계좌의 평가금액을 추정하여 합산
  const chartData: InvestmentChartData[] = Array.from(allDates)
    .map((date) => {
      let totalValue = 0;

      investmentsWithHistory.forEach((investment) => {
        const valueAtDate = getInvestmentValueAtDate(investment, date);
        totalValue += valueAtDate; // 0값도 포함
      });

      return {
        date,
        totalValue,
        dateFormatted: new Date(date).toLocaleDateString("ko-KR", {
          month: "short",
          day: "numeric",
        }),
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return chartData;
}

// 특정 날짜에서 투자 계좌의 평가금액을 추정하는 함수
function getInvestmentValueAtDate(investment: InvestmentItem, targetDate: string): number {
  const targetDateTime = new Date(targetDate).getTime();

  // 해당 날짜에 정확히 맞는 기록들을 모두 찾음
  const exactRecords = investment.records.filter((record) => record.date === targetDate);

  if (exactRecords.length > 0) {
    // 같은 날짜에 여러 기록이 있으면 마지막 기록을 사용 (배열의 마지막 요소)
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

// 시간 범위 라벨을 반환하는 함수
export function getTimeRangeLabel(range: TimeRange): string {
  switch (range) {
    case "30days":
      return "최근 30일";
    case "3months":
      return "최근 3개월";
    case "1year":
      return "최근 1년";
    default:
      return "최근 30일";
  }
}
