import { TimeRange } from "@web/types/time.types";

/**
 * 시간 범위 라벨을 반환하는 함수
 *
 * @param range - TimeRange enum 값
 * @returns 한국어 라벨 문자열
 *
 * @example
 * ```ts
 * getTimeRangeLabel(TimeRange.ONE_MONTH) // "1개월"
 * getTimeRangeLabel(TimeRange.ALL) // "전체 기간"
 * ```
 */
export function getTimeRangeLabel(range: TimeRange): string {
  switch (range) {
    case TimeRange.ONE_MONTH:
      return "1개월";
    case TimeRange.THREE_MONTHS:
      return "3개월";
    case TimeRange.ONE_YEAR:
      return "1년";
    case TimeRange.FIVE_YEARS:
      return "5년";
    case TimeRange.TEN_YEARS:
      return "10년";
    case TimeRange.ALL:
      return "전체 기간";
    default:
      return "3개월";
  }
}

// 날짜를 필터링하는 함수
export function getDateRange(range: TimeRange): Date {
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
