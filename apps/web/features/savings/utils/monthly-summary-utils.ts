import type { SavingsItem } from "../types/types";

/**
 * 월별 요약 데이터 인터페이스
 */
export interface MonthlySummaryRow {
  yearMonth: string; // "2024-01"
  displayMonth: string; // "2024년 1월"
  balance: number; // 잔액 (만원 단위)
  change: number; // 직전 월 대비 증감액 (만원 단위)
  hasChange: boolean; // 직전 월 데이터 존재 여부
}

/**
 * 저축 계좌들의 월별 요약 데이터 생성
 *
 * @param savings - 저축 계좌 배열
 * @returns 월별 요약 데이터 배열
 */
export function prepareMonthlySavingsSummary(savings: SavingsItem[]): MonthlySummaryRow[] {
  // 빈 배열 처리
  if (!savings || savings.length === 0) {
    return [];
  }

  // 계좌별, 월별 최신 잔액을 저장할 Map
  // Map<accountId, Map<yearMonth, balance>>
  const accountMonthlyData = new Map<string, Map<string, number>>();

  // 모든 계좌의 히스토리 수집
  savings.forEach((account) => {
    if (!account.records || account.records.length === 0) {
      return;
    }

    const monthlyMap = new Map<string, { date: string; balance: number }>();

    // 해당 계좌의 월별 최신 데이터 수집
    account.records.forEach((record) => {
      const yearMonth = record.date.substring(0, 7); // "2024-01"
      const existing = monthlyMap.get(yearMonth);

      if (!existing || record.date > existing.date) {
        // 해당 월의 첫 기록이거나, 더 최근 날짜인 경우
        monthlyMap.set(yearMonth, {
          date: record.date,
          balance: record.balance,
        });
      }
    });

    // 계좌별 월별 데이터 저장
    const balanceMap = new Map<string, number>();
    monthlyMap.forEach((data, yearMonth) => {
      balanceMap.set(yearMonth, data.balance);
    });
    accountMonthlyData.set(account.id, balanceMap);
  });

  // 모든 yearMonth 수집
  const allYearMonths = new Set<string>();
  accountMonthlyData.forEach((monthlyMap) => {
    monthlyMap.forEach((_, yearMonth) => {
      allYearMonths.add(yearMonth);
    });
  });

  // yearMonth별로 모든 계좌의 잔액 합산
  const summaryData: MonthlySummaryRow[] = Array.from(allYearMonths).map((yearMonth) => {
    let totalBalance = 0;

    // 모든 계좌의 해당 월 잔액 합산
    accountMonthlyData.forEach((monthlyMap) => {
      const balance = monthlyMap.get(yearMonth);
      if (balance !== undefined) {
        totalBalance += balance;
      }
    });

    const [year, month] = yearMonth.split("-");
    return {
      yearMonth,
      displayMonth: `${year}년 ${parseInt(month!, 10)}월`,
      balance: totalBalance,
      change: 0, // 임시값, 아래에서 계산
      hasChange: false, // 임시값, 아래에서 계산
    };
  });

  // 최신순 정렬
  summaryData.sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

  // 직전 월 대비 증감액 계산
  summaryData.forEach((row, index) => {
    // 다음 인덱스가 직전 월 (최신순 정렬이므로)
    const previousRow = summaryData[index + 1];

    if (previousRow) {
      row.change = row.balance - previousRow.balance;
      row.hasChange = true;
    }
  });

  return summaryData;
}
