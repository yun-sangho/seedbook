import { AssetPlan } from "@web/features/asset-plan/types/types";
import { InvestmentItem } from "@web/features/investments/types/types";
import { beforeEach, describe, expect, it } from "vitest";
import { getMonthlyContribution, preparePlanComparisonChartData } from "./plan-comparison-utils";

describe("preparePlanComparisonChartData", () => {
  let mockInvestments: InvestmentItem[];
  let mockPlan: AssetPlan;

  beforeEach(() => {
    // 목 투자 계좌 데이터 설정 (원 단위)
    mockInvestments = [
      {
        id: 1,
        accountName: "삼성증권 계좌",
        accountType: "일반투자계좌",
        accountOwner: "홍길동",
        currency: "KRW",
        initialInvestment: 10000000, // 1,000만원
        currentValue: 12000000, // 1,200만원
        note: "",
        color: "#3b82f6",
        records: [
          {
            date: "2024-06-01",
            initialInvestment: 10000000,
            currentValue: 10500000,
          },
          {
            date: "2024-07-01",
            initialInvestment: 10000000,
            currentValue: 11000000,
          },
          {
            date: "2024-08-01",
            initialInvestment: 10000000,
            currentValue: 12000000,
          },
        ],
      },
      {
        id: 2,
        accountName: "KB증권 계좌",
        accountType: "ISA 계좌",
        accountOwner: "홍길동",
        currency: "KRW",
        initialInvestment: 5000000, // 500만원
        currentValue: 5500000, // 550만원
        note: "",
        color: "#3b82f6",
        records: [
          {
            date: "2024-06-01",
            initialInvestment: 5000000,
            currentValue: 5200000,
          },
          {
            date: "2024-07-01",
            initialInvestment: 5000000,
            currentValue: 5300000,
          },
          {
            date: "2024-08-01",
            initialInvestment: 5000000,
            currentValue: 5500000,
          },
        ],
      },
    ];

    // 목 자산계획 데이터 설정 (원 단위)
    mockPlan = {
      id: "plan-1",
      planName: "은퇴 준비 계획",
      planPeriod: 10, // 10년 계획
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
      accountPlans: {
        1: {
          contributionAmount: "1000000", // 100만원
          contributionFrequency: "월",
          targetAnnualReturn: "7.0",
        },
        2: {
          contributionAmount: "2000000", // 200만원
          contributionFrequency: "분기",
          targetAnnualReturn: "5.0",
        },
      },
      totalMonthlyContribution: 1666700, // 약 166.67만원 (1000000 + 2000000/3)
      averageTargetReturn: 6.14, // 가중평균 수익률
    };
  });

  describe("기본 데이터 구성", () => {
    it("빈 투자 계좌 배열을 처리할 수 있어야 한다", () => {
      const result = preparePlanComparisonChartData([], mockPlan, "1year");

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // 빈 투자 계좌여도 계획 데이터는 생성되어야 함
      expect(result.length).toBeGreaterThan(0);
    });

    it("모든 반환 데이터 포인트가 필수 필드를 가져야 한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "1year");

      result.forEach((dataPoint) => {
        expect(dataPoint).toHaveProperty("date");
        expect(dataPoint).toHaveProperty("actual");
        expect(dataPoint).toHaveProperty("planned");
        expect(dataPoint).toHaveProperty("month");

        expect(typeof dataPoint.date).toBe("string");
        expect(typeof dataPoint.planned).toBe("number");
        expect(typeof dataPoint.month).toBe("string");

        // actual은 null이거나 number여야 함
        expect(dataPoint.actual === null || typeof dataPoint.actual === "number").toBe(true);
      });
    });

    it("날짜가 오름차순으로 정렬되어야 한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "1year");

      for (let i = 1; i < result.length; i++) {
        const current = result[i];
        const previous = result[i - 1];
        if (current && previous) {
          expect(new Date(current.date).getTime()).toBeGreaterThanOrEqual(
            new Date(previous.date).getTime()
          );
        }
      }
    });
  });

  describe("시간 범위별 데이터 생성", () => {
    it("30일 범위에서 적절한 데이터 포인트를 생성해야 한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "30days");

      expect(result.length).toBeGreaterThan(0);

      // 30일 범위에서는 과거 30일 + 현재 + 미래 몇 개월
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const firstResult = result[0];
      if (firstResult) {
        const firstDate = new Date(firstResult.date);
        expect(firstDate.getTime()).toBeLessThanOrEqual(today.getTime());
      }
    });

    it("전체 계획 범위에서 계획 기간 전체를 포함해야 한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "full");

      expect(result.length).toBeGreaterThan(0);

      // 10년 계획이므로 120개월 이상의 데이터 포인트가 있어야 함
      // (과거 6개월 + 현재 + 미래 120개월)
      expect(result.length).toBeGreaterThan(100);

      // 마지막 데이터 포인트가 계획 기간 끝에 가까워야 함
      const today = new Date();
      const planEndDate = new Date();
      planEndDate.setFullYear(planEndDate.getFullYear() + mockPlan.planPeriod);

      const lastResult = result[result.length - 1];
      if (lastResult) {
        const lastDate = new Date(lastResult.date);
        expect(lastDate.getTime()).toBeGreaterThan(today.getTime());
      }
    });
  });

  describe("계획 값 계산", () => {
    it("현재 시점의 계획 값이 실제 투자 총액과 일치해야 한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "full");

      const currentTotalInvestment = mockInvestments.reduce(
        (sum, inv) => sum + inv.currentValue,
        0
      );

      // 현재 시점(month = 0)의 계획 값 찾기
      const currentPlanValue = result.find((d, index) => {
        if (index === 0) return false; // 과거 데이터 제외
        const isToday = new Date(d.date).toDateString() === new Date().toDateString();
        return isToday || d.actual !== null;
      })?.planned;

      if (currentPlanValue) {
        // 현재 시점에서는 계획 값이 실제 투자 총액과 정확히 일치해야 함
        expect(currentPlanValue).toBe(currentTotalInvestment);
      }
    });

    it("미래 계획 값이 시간이 지남에 따라 증가해야 한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "full");

      // 미래 계획 데이터만 필터링
      const futureData = result.filter((d) => d.actual === null && d.planned > 0);

      expect(futureData.length).toBeGreaterThan(1);

      // 미래 계획 값이 일반적으로 증가하는지 확인 (월 납입금과 수익률 때문)
      let increasingCount = 0;
      for (let i = 1; i < Math.min(futureData.length, 12); i++) {
        const current = futureData[i];
        const previous = futureData[i - 1];
        if (current && previous && current.planned > previous.planned) {
          increasingCount++;
        }
      }

      // 최소 80%는 증가해야 함
      expect(increasingCount / Math.min(futureData.length - 1, 11)).toBeGreaterThan(0.8);
    });

    it("월 납입금이 계획 값 증가에 반영되어야 한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "full");

      // 1년 후와 현재 비교
      const currentValue = mockInvestments.reduce((sum, inv) => sum + inv.currentValue, 0);
      const oneYearLaterData = result.find((d) => {
        const date = new Date(d.date);
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

        return Math.abs(date.getTime() - oneYearFromNow.getTime()) < 30 * 24 * 60 * 60 * 1000; // 30일 오차
      });

      if (oneYearLaterData) {
        const expectedMinimumIncrease = mockPlan.totalMonthlyContribution * 12; // 1년간 납입금
        const actualIncrease = oneYearLaterData.planned - currentValue;

        // 납입금만으로도 증가해야 하므로 최소 납입금 총액보다는 커야 함
        expect(actualIncrease).toBeGreaterThan(expectedMinimumIncrease * 0.9);
      }
    });
  });

  describe("실제 값 처리", () => {
    it("과거 데이터에서 실제 값이 null이 아니어야 한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "1year");

      const today = new Date();
      const pastData = result.filter((d) => new Date(d.date) < today);

      pastData.forEach((dataPoint) => {
        expect(dataPoint.actual).not.toBeNull();
        expect(typeof dataPoint.actual).toBe("number");
        expect(dataPoint.actual).toBeGreaterThan(0);
      });
    });

    it("미래 데이터에서 실제 값이 null이어야 한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "full");

      const today = new Date();
      const futureData = result.filter((d) => {
        const dataDate = new Date(d.date);
        return dataDate > today;
      });

      // 미래 데이터 중 대부분은 actual이 null이어야 함 (현재 시점 제외)
      const nullActualCount = futureData.filter((d) => d.actual === null).length;
      expect(nullActualCount).toBeGreaterThan(futureData.length * 0.8);
    });

    it("투자 기록을 바탕으로 과거 실제 값을 정확히 계산해야 한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "1year");

      // 특정 과거 날짜의 데이터 찾기
      const targetDate = "2024-07-01";
      const targetData = result.find((d) => d.date === targetDate);

      if (targetData && targetData.actual !== null) {
        // 해당 날짜의 예상 총 투자 가치 계산
        const expectedValue = mockInvestments.reduce((sum, inv) => {
          const record = inv.records.find((r) => r.date === targetDate);
          return sum + (record ? record.currentValue : inv.currentValue);
        }, 0);

        // 실제 값과 예상 값이 일치해야 함
        expect(targetData.actual).toBe(expectedValue);
      }
    });
  });

  describe("edge cases", () => {
    it("수익률이 0%인 경우를 처리할 수 있어야 한다", () => {
      const zeroPlan = {
        ...mockPlan,
        accountPlans: {
          1: {
            contributionAmount: "1000000",
            contributionFrequency: "월",
            targetAnnualReturn: "0.0",
          },
        },
        averageTargetReturn: 0,
      };

      const result = preparePlanComparisonChartData(mockInvestments, zeroPlan, "1year");

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      // 수익률이 0이어도 월 납입금으로 인해 증가해야 함
      const futureData = result.filter((d) => d.actual === null);
      if (futureData.length > 1) {
        const lastFuture = futureData[futureData.length - 1];
        const firstFuture = futureData[0];
        if (lastFuture && firstFuture) {
          expect(lastFuture.planned).toBeGreaterThan(firstFuture.planned);
        }
      }
    });

    it("매우 높은 수익률을 처리할 수 있어야 한다", () => {
      const highReturnPlan = {
        ...mockPlan,
        accountPlans: {
          1: {
            contributionAmount: "1000000",
            contributionFrequency: "월",
            targetAnnualReturn: "50.0", // 연 50% 수익률
          },
        },
        averageTargetReturn: 50,
      };

      const result = preparePlanComparisonChartData(mockInvestments, highReturnPlan, "1year");

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      // 결과 값들이 모두 유한한 숫자여야 함
      result.forEach((dataPoint) => {
        expect(Number.isFinite(dataPoint.planned)).toBe(true);
        if (dataPoint.actual !== null) {
          expect(Number.isFinite(dataPoint.actual)).toBe(true);
        }
      });
    });

    it("계획에 없는 투자 계좌를 처리할 수 있어야 한다", () => {
      const incompletePlan = {
        ...mockPlan,
        accountPlans: {
          1: {
            contributionAmount: "1000000",
            contributionFrequency: "월",
            targetAnnualReturn: "7.0",
          },
          // 계좌 2에 대한 계획이 없음
        },
      };

      const result = preparePlanComparisonChartData(mockInvestments, incompletePlan, "1year");

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      // 오류 없이 처리되어야 함
      result.forEach((dataPoint) => {
        expect(typeof dataPoint.planned).toBe("number");
        expect(dataPoint.planned).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("데이터 일관성", () => {
    it("동일한 입력에 대해 일관된 결과를 반환해야 한다", () => {
      const result1 = preparePlanComparisonChartData(mockInvestments, mockPlan, "1year");
      const result2 = preparePlanComparisonChartData(mockInvestments, mockPlan, "1year");

      expect(result1.length).toBe(result2.length);

      for (let i = 0; i < result1.length; i++) {
        const item1 = result1[i];
        const item2 = result2[i];
        if (item1 && item2) {
          expect(item1.date).toBe(item2.date);
          expect(item1.planned).toBe(item2.planned);
          expect(item1.actual).toBe(item2.actual);
        }
      }
    });

    it("month 필드가 올바른 형식이어야 한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "1year");

      result.forEach((dataPoint) => {
        expect(dataPoint.month).toMatch(/^\d{4}-\d{2}$/); // YYYY-MM 형식

        // month가 date와 일치하는지 확인
        const date = new Date(dataPoint.date);
        const expectedMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        expect(dataPoint.month).toBe(expectedMonth);
      });
    });
  });

  describe("새 타입 속성 (kind, monthOffset) 및 helper", () => {
    it("getMonthlyContribution이 주기 변환을 정확히 수행한다", () => {
      expect(getMonthlyContribution("1200000", "월")).toBeCloseTo(1200000);
      expect(getMonthlyContribution("1200000", "분기")).toBeCloseTo(400000); // 1200000/3
      expect(getMonthlyContribution("1200000", "반기")).toBeCloseTo(200000); // 1200000/6
      expect(getMonthlyContribution("1200000", "년")).toBeCloseTo(100000); // 1200000/12
      expect(getMonthlyContribution("abc", "월")).toBe(0);
      expect(getMonthlyContribution("1200000", "없음")).toBe(0);
    });

    it("kind에 따라 actual 필드 null 여부가 올바르게 구분된다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "1year");
      const futurePoints = result.filter((p) => p.kind === "future");
      const pastPoints = result.filter((p) => p.kind === "past");
      const presentPoints = result.filter((p) => p.kind === "present");

      // present 포인트는 1개 이상 (주간 샘플링이 오늘과 같은 달 내 동일 월오프셋 0을 여러 개 포함할 수 있음)
      expect(presentPoints.length).toBeGreaterThanOrEqual(1);
      presentPoints.forEach((p) => {
        expect(p.actual).toBeGreaterThan(0);
        expect(p.monthOffset).toBe(0);
      });

      pastPoints.forEach((p) => expect(p.actual).not.toBeNull());
      futurePoints.forEach((p) => expect(p.actual).toBeNull());
    });

    it("monthOffset 부호가 과거/현재/미래를 반영한다", () => {
      const result = preparePlanComparisonChartData(mockInvestments, mockPlan, "1year");
      const present = result.find((p) => p.kind === "present");
      expect(present?.monthOffset).toBe(0);
      // 과거는 음수
      result.filter((p) => p.kind === "past").forEach((p) => expect(p.monthOffset).toBeLessThan(0));
      // 미래는 양수 (>=1)
      result
        .filter((p) => p.kind === "future")
        .forEach((p) => expect(p.monthOffset).toBeGreaterThan(0));
    });

    it("PlanComparisonPoint 타입이 좁혀지는지 타입 단언 검사 (컴파일 시점)", () => {
      const points = preparePlanComparisonChartData(mockInvestments, mockPlan, "30days");
      // 런타임 검증 + 타입 내로잉 예시
      points.forEach((pt) => {
        if (pt.kind === "future") {
          expect(pt.actual).toBeNull();
        } else {
          // past | present
          expect(pt.actual).not.toBeNull();
        }
      });
    });
  });
});
