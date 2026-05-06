import { InvestmentItem } from "@web/features/investments/types/types";
import { calculateReturnRate } from "@web/utils/number-format";
import { MonthlySummaryRow } from "../app/(app)/assets/investments/_components/monthly-summary-columns";

/**
 * 투자 데이터를 월별 요약 데이터로 변환합니다.
 * 각 월의 마지막 날짜 기준 데이터를 사용합니다.
 */
export function prepareMonthlyInvestmentSummary(
  investments: InvestmentItem[]
): MonthlySummaryRow[] {
  // 모든 투자 기록을 수집
  const allRecords = investments.flatMap((inv) =>
    inv.records.map((record) => ({
      ...record,
      accountId: inv.id,
    }))
  );

  if (allRecords.length === 0) {
    return [];
  }

  // 월별로 그룹화 (YYYY-MM)
  const monthlyGroups = new Map<
    string,
    Array<{
      date: string;
      initialInvestment: number;
      currentValue: number;
      accountId: string;
    }>
  >();

  allRecords.forEach((record) => {
    const yearMonth = record.date.substring(0, 7); // "YYYY-MM"
    if (!monthlyGroups.has(yearMonth)) {
      monthlyGroups.set(yearMonth, []);
    }
    monthlyGroups.get(yearMonth)!.push(record);
  });

  // 각 월의 마지막 날짜 기준으로 데이터 집계
  const monthlySummariesMap = new Map<string, MonthlySummaryRow>();

  monthlyGroups.forEach((records, yearMonth) => {
    // 해당 월의 각 계좌별 마지막 기록 찾기
    const accountLastRecords = new Map<string, (typeof records)[0]>();

    records.forEach((record) => {
      const existing = accountLastRecords.get(record.accountId);
      if (!existing || record.date > existing.date) {
        accountLastRecords.set(record.accountId, record);
      }
    });

    // 각 계좌의 마지막 기록을 합산
    let totalInitialInvestment = 0;
    let totalCurrentValue = 0;

    accountLastRecords.forEach((record) => {
      totalInitialInvestment += record.initialInvestment;
      totalCurrentValue += record.currentValue;
    });

    // 표시용 월 포맷 생성 (예: "2024년 1월")
    const [year, month] = yearMonth.split("-");
    const displayMonth = `${year}년 ${parseInt(month ?? "1")}월`;

    monthlySummariesMap.set(yearMonth, {
      yearMonth,
      displayMonth,
      initialInvestment: totalInitialInvestment,
      currentValue: totalCurrentValue,
      profit: 0, // Will be calculated below
      returnRate: 0, // Will be calculated below
    });
  });

  // 날짜순으로 정렬 (오래된 순)하여 배열로 변환
  const sortedMonths = Array.from(monthlySummariesMap.keys()).sort((a, b) => a.localeCompare(b));

  // 직전 달 대비 수익금 및 수익률 계산
  const monthlySummaries: MonthlySummaryRow[] = [];
  let previousMonthValue: number | null = null;

  sortedMonths.forEach((yearMonth) => {
    const summary = monthlySummariesMap.get(yearMonth)!;
    const currentValue = summary.currentValue;

    if (previousMonthValue === null) {
      // 첫 번째 월: 투자원금 대비 계산
      summary.profit = currentValue - summary.initialInvestment;
      summary.returnRate = calculateReturnRate(currentValue, summary.initialInvestment);
    } else {
      // 이후 월: 직전 달 평가금액 대비 계산
      summary.profit = currentValue - previousMonthValue;
      summary.returnRate = calculateReturnRate(currentValue, previousMonthValue);
    }

    previousMonthValue = currentValue;
    monthlySummaries.push(summary);
  });

  // 최신순으로 정렬
  monthlySummaries.reverse();

  return monthlySummaries;
}
