import { AssetPlan } from "@web/features/asset-plan/types/types";
import { InvestmentItem } from "@web/features/investments/types/types";

/**
 * 월 환산 납입금 계산 (만원 단위 유지)
 */
function getMonthlyContribution(amount: string, frequency: string): number {
  const numericAmount = parseFloat(amount.replace(/,/g, "")); // 만원 단위 그대로 사용
  if (isNaN(numericAmount)) return 0;

  switch (frequency) {
    case "월":
      return numericAmount;
    case "분기":
      return numericAmount / 3;
    case "반기":
      return numericAmount / 6;
    case "년":
      return numericAmount / 12;
    default:
      return 0;
  }
}

/**
 * 실제 투자 데이터와 계획 예상치를 비교하기 위한 차트 데이터 준비
 */
export function preparePlanComparisonChartData(
  investments: InvestmentItem[],
  plan: AssetPlan,
  timeRange: "30days" | "3months" | "1year" | "full" = "full"
): Array<{
  date: string;
  actual: number | null;
  planned: number;
  month: string;
}> {
  const combinedData: Array<{
    date: string;
    actual: number | null;
    planned: number;
    month: string;
  }> = [];

  // 계획 기간에 따른 월 수 계산
  const totalMonths =
    timeRange === "full"
      ? plan.planPeriod * 12
      : timeRange === "1year"
        ? 12
        : timeRange === "3months"
          ? 3
          : 1;

  // 시작 날짜 설정 (과거 데이터용)
  const today = new Date();
  const startDate = new Date(today);

  if (timeRange !== "full") {
    switch (timeRange) {
      case "30days":
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "3months":
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case "1year":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }
  } else {
    // 전체 계획 보기에서는 과거 6개월부터 시작
    startDate.setMonth(startDate.getMonth() - 6);
  }

  // 과거 데이터 생성 (실제 데이터)
  const actualData = getActualInvestmentData(investments, startDate, today);

  // 과거 실제 데이터를 차트 데이터에 추가
  actualData.forEach((point) => {
    const date = new Date(point.date);
    combinedData.push({
      date: point.date,
      actual: point.value,
      planned: point.value, // 과거는 실제값과 동일
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    });
  });

  // 미래 계획 데이터 생성
  const currentTotalValue = investments.reduce((sum, inv) => sum + inv.currentValue, 0);

  for (let month = 0; month <= totalMonths; month++) {
    const projectionDate = new Date(today);
    projectionDate.setMonth(projectionDate.getMonth() + month);

    const dateStr = projectionDate.toISOString().split("T")[0] || "";

    // 이미 과거 데이터에 있는 날짜는 건너뛰기
    if (combinedData.find((d) => d.date === dateStr)) continue;

    // 각 계좌별 예상 값 계산
    let totalProjectedValue = 0;

    investments.forEach((investment) => {
      const accountPlan = plan.accountPlans[investment.id];
      if (!accountPlan) {
        totalProjectedValue += investment.currentValue;
        return;
      }

      const monthlyContribution = getMonthlyContribution(
        accountPlan.contributionAmount,
        accountPlan.contributionFrequency
      );
      const annualReturn = parseFloat(accountPlan.targetAnnualReturn) / 100;
      const monthlyReturn = Math.pow(1 + annualReturn, 1 / 12) - 1;

      // 복리 계산
      const initialValue = investment.currentValue;
      const growthFromInitial = initialValue * Math.pow(1 + monthlyReturn, month);

      const growthFromContributions =
        monthlyReturn > 0
          ? monthlyContribution * ((Math.pow(1 + monthlyReturn, month) - 1) / monthlyReturn)
          : monthlyContribution * month;

      totalProjectedValue += growthFromInitial + growthFromContributions;
    });

    combinedData.push({
      date: dateStr,
      actual: month === 0 ? currentTotalValue : null, // 현재 시점만 실제값
      planned: Math.round(totalProjectedValue),
      month: `${projectionDate.getFullYear()}-${String(projectionDate.getMonth() + 1).padStart(2, "0")}`,
    });
  }

  return combinedData.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 실제 투자 데이터를 바탕으로 과거 투자 가치 추정
 */
function getActualInvestmentData(
  investments: InvestmentItem[],
  startDate: Date,
  endDate: Date
): Array<{ date: string; value: number }> {
  const dataPoints: Array<{ date: string; value: number }> = [];

  // 현재 총 투자 가치
  const currentTotalValue = investments.reduce((sum, inv) => sum + inv.currentValue, 0);

  // 각 투자 계좌의 기록을 바탕으로 과거 가치 추정
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().split("T")[0] || "";

    let totalValue = 0;

    investments.forEach((investment) => {
      // 해당 날짜 이전의 가장 최근 기록 찾기
      const relevantRecords = investment.records
        .filter((record) => new Date(record.date) <= current)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (relevantRecords.length > 0 && relevantRecords[0]) {
        // 가장 최근 기록의 현재 가치 사용
        totalValue += relevantRecords[0].currentValue;
      } else {
        // 기록이 없으면 현재 값을 사용 (근사치)
        totalValue += investment.currentValue;
      }
    });

    // 값이 0이면 현재 총 가치를 시작점으로 사용
    if (totalValue === 0) {
      totalValue = currentTotalValue;
    }

    dataPoints.push({
      date: dateStr,
      value: totalValue,
    });

    current.setDate(current.getDate() + 7); // 주 단위로 데이터 포인트 생성
  }

  return dataPoints;
}
