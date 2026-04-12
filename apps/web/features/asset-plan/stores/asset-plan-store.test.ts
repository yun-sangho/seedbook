import { beforeEach, describe, expect, it } from "vitest";
import { useAssetPlanStore } from "./asset-plan-store";

// Zustand store를 테스트하기 위한 헬퍼 함수
const resetStore = () => {
  useAssetPlanStore.setState({ plans: [] });
};

describe("AssetPlanStore", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("addPlan", () => {
    it("새로운 계획을 올바르게 추가해야 한다", () => {
      const planData = {
        planName: "은퇴 준비 계획",
        planPeriod: 10,
        accountPlans: {
          "1": {
            contributionAmount: "1000000", // 100만원
            contributionFrequency: "월",
            targetAnnualReturn: "7.0",
            accountKind: "investment" as const,
          },
          "2": {
            contributionAmount: "2000000", // 200만원
            contributionFrequency: "분기",
            targetAnnualReturn: "5.0",
            accountKind: "investment" as const,
          },
        },
        totalMonthlyContribution: 1666700, // 원 단위로 저장
        averageTargetReturn: 6.14,
      };

      const { addPlan } = useAssetPlanStore.getState();
      addPlan(planData);

      const updatedPlans = useAssetPlanStore.getState().plans;
      expect(updatedPlans).toHaveLength(1);

      const savedPlan = updatedPlans[0];
      expect(savedPlan).toBeDefined();
      expect(savedPlan!.planName).toBe("은퇴 준비 계획");
      expect(savedPlan!.planPeriod).toBe(10);
      expect(savedPlan!.totalMonthlyContribution).toBe(1666700); // 원 단위
      expect(savedPlan!.averageTargetReturn).toBe(6.14);
      expect(savedPlan!.id).toBeDefined();
      expect(savedPlan!.createdAt).toBeInstanceOf(Date);
      expect(savedPlan!.updatedAt).toBeInstanceOf(Date);
    });

    it("계획 ID가 고유해야 한다", () => {
      const { addPlan } = useAssetPlanStore.getState();

      const planData = {
        planName: "테스트 계획",
        planPeriod: 10,
        accountPlans: {},
        totalMonthlyContribution: 1000000,
        averageTargetReturn: 5.0,
      };

      addPlan(planData);
      addPlan(planData);

      const plans = useAssetPlanStore.getState().plans;
      expect(plans).toHaveLength(2);
      expect(plans[0]!.id).not.toBe(plans[1]!.id);
    });
  });

  describe("updatePlan", () => {
    it("기존 계획을 올바르게 업데이트해야 한다", () => {
      const { addPlan, updatePlan } = useAssetPlanStore.getState();

      const originalPlan = {
        planName: "원본 계획",
        planPeriod: 10,
        accountPlans: {
          "1": {
            contributionAmount: "1000000",
            contributionFrequency: "월",
            targetAnnualReturn: "5.0",
            accountKind: "investment" as const,
          },
        },
        totalMonthlyContribution: 1000000,
        averageTargetReturn: 5.0,
      };

      addPlan(originalPlan);
      const plans = useAssetPlanStore.getState().plans;
      const planId = plans[0]!.id;

      updatePlan(planId, {
        planName: "수정된 계획",
        totalMonthlyContribution: 2000000, // 원 단위
      });

      const updatedPlans = useAssetPlanStore.getState().plans;
      const updatedPlan = updatedPlans[0]!;

      expect(updatedPlan.planName).toBe("수정된 계획");
      expect(updatedPlan.totalMonthlyContribution).toBe(2000000); // 원 단위
      expect(updatedPlan.planPeriod).toBe(10); // 변경되지 않은 필드
    });
  });

  describe("deletePlan", () => {
    it("계획을 올바르게 삭제해야 한다", () => {
      const { addPlan, deletePlan } = useAssetPlanStore.getState();

      addPlan({
        planName: "삭제될 계획",
        planPeriod: 5,
        accountPlans: {},
        totalMonthlyContribution: 1000000,
        averageTargetReturn: 5.0,
      });

      const plans = useAssetPlanStore.getState().plans;
      expect(plans).toHaveLength(1);

      deletePlan(plans[0]!.id);

      const updatedPlans = useAssetPlanStore.getState().plans;
      expect(updatedPlans).toHaveLength(0);
    });
  });

  describe("getPlanById", () => {
    it("ID로 계획을 올바르게 조회해야 한다", () => {
      const { addPlan, getPlanById } = useAssetPlanStore.getState();

      const planData = {
        planName: "조회 테스트 계획",
        planPeriod: 15,
        accountPlans: {
          "1": {
            contributionAmount: "1500000",
            contributionFrequency: "월",
            targetAnnualReturn: "6.0",
            accountKind: "investment" as const,
          },
        },
        totalMonthlyContribution: 1500000, // 원 단위
        averageTargetReturn: 6.0,
      };

      addPlan(planData);
      const plans = useAssetPlanStore.getState().plans;
      const planId = plans[0]!.id;

      const foundPlan = getPlanById(planId);
      expect(foundPlan).toBeDefined();
      expect(foundPlan!.planName).toBe("조회 테스트 계획");
      expect(foundPlan!.totalMonthlyContribution).toBe(1500000); // 원 단위
    });

    it("존재하지 않는 ID로 조회 시 undefined를 반환해야 한다", () => {
      const { getPlanById } = useAssetPlanStore.getState();
      const foundPlan = getPlanById("non-existent-id");
      expect(foundPlan).toBeUndefined();
    });
  });

  describe("금액 단위 검증", () => {
    it("totalMonthlyContribution이 원 단위로 저장되어야 한다", () => {
      const { addPlan } = useAssetPlanStore.getState();

      const planData = {
        planName: "단위 테스트",
        planPeriod: 10,
        accountPlans: {
          "1": {
            contributionAmount: "1000000", // 100만원 입력
            contributionFrequency: "월",
            targetAnnualReturn: "7.0",
            accountKind: "investment" as const,
          },
          "2": {
            contributionAmount: "3000000", // 300만원 입력
            contributionFrequency: "분기", // 분기당 300만원 = 월 100만원
            targetAnnualReturn: "5.0",
            accountKind: "investment" as const,
          },
        },
        totalMonthlyContribution: 2000000, // 100만 + 100만 = 200만원 (원 단위)
        averageTargetReturn: 6.0,
      };

      addPlan(planData);
      const plans = useAssetPlanStore.getState().plans;
      const savedPlan = plans[0]!;

      expect(savedPlan.totalMonthlyContribution).toBe(2000000);
      expect(savedPlan.accountPlans["1"]!.contributionAmount).toBe("1000000");
      expect(savedPlan.accountPlans["2"]!.contributionAmount).toBe("3000000");
    });

    it("다양한 납입 주기의 월 환산 금액이 원 단위로 저장되어야 한다", () => {
      const { addPlan } = useAssetPlanStore.getState();

      // 월 100만원 + 분기 300만원(=월100만원) + 반기 600만원(=월100만원) + 연 1200만원(=월100만원)
      const planData = {
        planName: "다양한 주기 테스트",
        planPeriod: 10,
        accountPlans: {
          "1": {
            contributionAmount: "1000000",
            contributionFrequency: "월",
            targetAnnualReturn: "7.0",
            accountKind: "investment" as const,
          },
          "2": {
            contributionAmount: "3000000",
            contributionFrequency: "분기",
            targetAnnualReturn: "7.0",
            accountKind: "investment" as const,
          },
          "3": {
            contributionAmount: "6000000",
            contributionFrequency: "반기",
            targetAnnualReturn: "7.0",
            accountKind: "investment" as const,
          },
          "4": {
            contributionAmount: "12000000",
            contributionFrequency: "년",
            targetAnnualReturn: "7.0",
            accountKind: "investment" as const,
          },
        },
        totalMonthlyContribution: 4000000, // 100만 + 100만 + 100만 + 100만 = 400만원
        averageTargetReturn: 7.0,
      };

      addPlan(planData);
      const plans = useAssetPlanStore.getState().plans;
      const savedPlan = plans[0]!;

      expect(savedPlan.totalMonthlyContribution).toBe(4000000); // 원 단위
    });

    it("실제 plan 생성 시 계산되는 totalMonthlyContribution이 원 단위여야 한다", () => {
      // 실제 UI에서 사용되는 것과 같은 방식으로 계산
      const accountPlans = {
        "1": {
          contributionAmount: "1000000",
          contributionFrequency: "월",
          targetAnnualReturn: "7.0",
          accountKind: "investment" as const,
        },
        "2": {
          contributionAmount: "2000000",
          contributionFrequency: "분기",
          targetAnnualReturn: "5.0",
          accountKind: "investment" as const,
        },
      };

      // getMonthlyContribution 함수 로직 (원 단위)
      const getMonthlyContribution = (amount: string, frequency: string): number => {
        const numericAmount = parseFloat(amount.replace(/,/g, ""));
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
      };

      const totalMonthlyContribution = Object.entries(accountPlans).reduce((sum, [, plan]) => {
        return (
          sum +
          getMonthlyContribution(
            plan?.contributionAmount || "0",
            plan?.contributionFrequency || "월"
          )
        );
      }, 0);

      // 100만원(월) + 66.67만원(분기당 200만원 = 월 66.67만원) = 166.67만원 = 1666666.67원
      expect(Math.round(totalMonthlyContribution * 100) / 100).toBe(1666666.67);

      const { addPlan } = useAssetPlanStore.getState();
      addPlan({
        planName: "실제 계산 테스트",
        planPeriod: 10,
        accountPlans,
        totalMonthlyContribution,
        averageTargetReturn: 6.0,
      });

      const plans = useAssetPlanStore.getState().plans;
      const savedPlan = plans[0]!;

      expect(Math.round(savedPlan.totalMonthlyContribution * 100) / 100).toBe(1666666.67);
    });
  });

  describe("데이터 타입 검증", () => {
    it("날짜 필드가 Date 객체여야 한다", () => {
      const { addPlan } = useAssetPlanStore.getState();

      addPlan({
        planName: "날짜 테스트",
        planPeriod: 5,
        accountPlans: {},
        totalMonthlyContribution: 1000000,
        averageTargetReturn: 5.0,
      });

      const plans = useAssetPlanStore.getState().plans;
      const plan = plans[0]!;

      expect(plan.createdAt).toBeInstanceOf(Date);
      expect(plan.updatedAt).toBeInstanceOf(Date);
    });

    it("숫자 필드가 올바른 타입이어야 한다", () => {
      const { addPlan } = useAssetPlanStore.getState();

      addPlan({
        planName: "타입 테스트",
        planPeriod: 10,
        accountPlans: {},
        totalMonthlyContribution: 1505000, // 소수점도 지원
        averageTargetReturn: 6.75,
      });

      const plans = useAssetPlanStore.getState().plans;
      const plan = plans[0]!;

      expect(typeof plan.planPeriod).toBe("number");
      expect(typeof plan.totalMonthlyContribution).toBe("number");
      expect(typeof plan.averageTargetReturn).toBe("number");
      expect(plan.totalMonthlyContribution).toBe(1505000);
      expect(plan.averageTargetReturn).toBe(6.75);
    });
  });
});
