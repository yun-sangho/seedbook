import type { DebtsItem } from "@web/features/debts/types/types";
import type { InvestmentItem } from "@web/features/investments/types/types";
import type { RealAssetItem } from "@web/features/real-assets/types/types";
import type { SavingsItem } from "@web/features/savings/types/types";
import type { AssetProgressPoint } from "../types/progress";

/**
 * 날짜 유효성 검사
 */
function isValidDate(dateString: string | undefined | null): boolean {
  if (!dateString || dateString.trim() === "") {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * 모든 자산의 records를 수집하여 날짜별 자산 진행 포인트를 생성
 */
export function generateAssetProgressPoints(
  investments: InvestmentItem[],
  savings: SavingsItem[],
  realAssets: RealAssetItem[],
  loans: DebtsItem[]
): AssetProgressPoint[] {
  const dateMap = new Map<string, AssetProgressPoint>();

  // 투자 기록 처리
  investments.forEach((investment) => {
    investment.records.forEach((record) => {
      const existing = dateMap.get(record.date);
      if (existing) {
        existing.investments += record.currentValue;
        existing.totalAssets += record.currentValue;
      } else {
        dateMap.set(record.date, {
          date: record.date,
          totalAssets: record.currentValue,
          netAssets: record.currentValue,
          investments: record.currentValue,
          savings: 0,
          realAssets: 0,
          loans: 0,
        });
      }
    });
  });

  // 저축 기록 처리
  savings.forEach((saving) => {
    saving.records.forEach((record) => {
      const existing = dateMap.get(record.date);
      if (existing) {
        existing.savings += record.balance;
        existing.totalAssets += record.balance;
      } else {
        dateMap.set(record.date, {
          date: record.date,
          totalAssets: record.balance,
          netAssets: record.balance,
          investments: 0,
          savings: record.balance,
          realAssets: 0,
          loans: 0,
        });
      }
    });
  });

  // 실물자산 처리 (구입일자 기준으로 포인트 생성)
  realAssets.forEach((asset) => {
    const existing = dateMap.get(asset.purchaseDate);
    if (existing) {
      existing.realAssets += asset.currentValue;
      existing.totalAssets += asset.currentValue;
    } else {
      dateMap.set(asset.purchaseDate, {
        date: asset.purchaseDate,
        totalAssets: asset.currentValue,
        netAssets: asset.currentValue,
        investments: 0,
        savings: 0,
        realAssets: asset.currentValue,
        loans: 0,
      });
    }
  });

  // 대출 처리 (만기일 기준으로 포인트 생성 - 실제로는 대출 시작일이 더 적합할 수 있음)
  loans.forEach((loan) => {
    // 대출은 부채이므로 순자산에서 차감
    const existing = dateMap.get(loan.maturityDate);
    if (existing) {
      existing.loans += loan.amount;
    } else {
      dateMap.set(loan.maturityDate, {
        date: loan.maturityDate,
        totalAssets: 0,
        netAssets: -loan.amount,
        investments: 0,
        savings: 0,
        realAssets: 0,
        loans: loan.amount,
      });
    }
  });

  // 순자산 재계산
  dateMap.forEach((point) => {
    point.netAssets = point.totalAssets - point.loans;
  });

  // 날짜순 정렬
  const sortedPoints = Array.from(dateMap.values()).sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return sortedPoints;
}

/**
 * 누적 자산 포인트 생성 (각 날짜의 자산이 이전 값에 누적됨)
 */
export function generateCumulativeProgressPoints(
  investments: InvestmentItem[],
  savings: SavingsItem[],
  realAssets: RealAssetItem[],
  loans: DebtsItem[]
): AssetProgressPoint[] {
  const allDates = new Set<string>();
  const assetsByDate = new Map<
    string,
    {
      investments: Map<number, number>;
      savings: Map<number, number>;
      realAssets: Map<number, number>;
      loans: Map<number, number>;
    }
  >();

  // 모든 날짜 수집 및 초기화
  const initDateMap = (date: string) => {
    if (!assetsByDate.has(date)) {
      assetsByDate.set(date, {
        investments: new Map(),
        savings: new Map(),
        realAssets: new Map(),
        loans: new Map(),
      });
    }
  };

  // 투자 기록 수집
  investments.forEach((investment) => {
    investment.records.forEach((record) => {
      if (!isValidDate(record.date)) return;
      allDates.add(record.date);
      initDateMap(record.date);
      assetsByDate.get(record.date)!.investments.set(investment.id, record.currentValue);
    });
  });

  // 저축 기록 수집
  savings.forEach((saving) => {
    saving.records.forEach((record) => {
      if (!isValidDate(record.date)) return;
      allDates.add(record.date);
      initDateMap(record.date);
      assetsByDate.get(record.date)!.savings.set(saving.id, record.balance);
    });
  });

  // 실물자산 수집
  realAssets.forEach((asset) => {
    if (!isValidDate(asset.purchaseDate)) return;
    allDates.add(asset.purchaseDate);
    initDateMap(asset.purchaseDate);
    assetsByDate.get(asset.purchaseDate)!.realAssets.set(asset.id, asset.currentValue);
  });

  // 대출 수집 (만기일 기준)
  loans.forEach((loan) => {
    if (!isValidDate(loan.maturityDate)) return;
    allDates.add(loan.maturityDate);
    initDateMap(loan.maturityDate);
    assetsByDate.get(loan.maturityDate)!.loans.set(loan.id, loan.amount);
  });

  // 날짜 정렬
  const sortedDates = Array.from(allDates).sort((a, b) => {
    return new Date(a).getTime() - new Date(b).getTime();
  });

  const progressPoints: AssetProgressPoint[] = [];
  const latestValues = {
    investments: new Map<number, number>(),
    savings: new Map<number, number>(),
    realAssets: new Map<number, number>(),
    loans: new Map<number, number>(),
  };

  // 각 날짜별로 누적 계산
  sortedDates.forEach((date) => {
    const dateData = assetsByDate.get(date)!;

    // 해당 날짜에 업데이트된 값 반영
    dateData.investments.forEach((value, id) => {
      latestValues.investments.set(id, value);
    });
    dateData.savings.forEach((value, id) => {
      latestValues.savings.set(id, value);
    });
    dateData.realAssets.forEach((value, id) => {
      latestValues.realAssets.set(id, value);
    });
    dateData.loans.forEach((value, id) => {
      latestValues.loans.set(id, value);
    });

    // 현재 시점의 총합 계산
    const investmentsTotal = Array.from(latestValues.investments.values()).reduce(
      (sum, val) => sum + val,
      0
    );
    const savingsTotal = Array.from(latestValues.savings.values()).reduce(
      (sum, val) => sum + val,
      0
    );
    const realAssetsTotal = Array.from(latestValues.realAssets.values()).reduce(
      (sum, val) => sum + val,
      0
    );
    const loansTotal = Array.from(latestValues.loans.values()).reduce((sum, val) => sum + val, 0);

    const totalAssets = investmentsTotal + savingsTotal + realAssetsTotal;
    const netAssets = totalAssets - loansTotal;

    progressPoints.push({
      date,
      totalAssets,
      netAssets,
      investments: investmentsTotal,
      savings: savingsTotal,
      realAssets: realAssetsTotal,
      loans: loansTotal,
    });
  });

  return progressPoints;
}
