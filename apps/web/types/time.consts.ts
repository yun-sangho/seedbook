/**
 * 투자 추이 기간 (계정 설정 `investmentTrendRange` 의 값). 차트는 지금 없고 설정 값만 남아 있다 —
 * 서버 컬럼·레코드 정의(`INVESTMENT_TREND_RANGES`)와 맞춰 두고 동기화 v2-5 에서 함께 지운다.
 */
export enum TimeRange {
  ONE_MONTH = "1month",
  THREE_MONTHS = "3months",
  ONE_YEAR = "1year",
  FIVE_YEARS = "5years",
  TEN_YEARS = "10years",
  ALL = "all",
}
