import type { SavingsItem } from "../types/types";

/**
 * 월별 요약 데이터 인터페이스
 */
export interface MonthlySummaryRow {
  yearMonth: string; // "2024-01"
  displayMonth: string; // "2024년 1월"
  balance: number; // 잔액 (만원 단위)
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

  // 월별 데이터를 집계하기 위한 Map
  const monthlyMap = new Map<
    string,
    {
      date: string; // 해당 월의 가장 최근 날짜
      balance: number;
    }
  >();

  // 모든 계좌의 히스토리 수집
  savings.forEach((account) => {
    if (!account.records || account.records.length === 0) {
      return;
    }

    account.records.forEach((record) => {
      const yearMonth = record.date.substring(0, 7); // "2024-01"

      const existing = monthlyMap.get(yearMonth);

      if (!existing || record.date > existing.date) {
        // 해당 월의 첫 기록이거나, 더 최근 날짜인 경우
        monthlyMap.set(yearMonth, {
          date: record.date,
          balance: record.balance,
        });
      } else if (record.date === existing.date) {
        // 같은 날짜인 경우 잔액 합산
        monthlyMap.set(yearMonth, {
          date: record.date,
          balance: existing.balance + record.balance,
        });
      }
    });
  });

  // Map을 배열로 변환
  const summaryData: MonthlySummaryRow[] = Array.from(monthlyMap.entries()).map(
    ([yearMonth, data]) => {
      const [year, month] = yearMonth.split("-");
      return {
        yearMonth,
        displayMonth: `${year}년 ${parseInt(month!, 10)}월`,
        balance: data.balance,
      };
    }
  );

  // 최신순 정렬
  summaryData.sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

  return summaryData;
}
