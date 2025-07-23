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
          1: {
            contributionAmount: "100", // 100만원
            contributionFrequency: "월",
            targetAnnualReturn: "7.0",
          },
          2: {
            contributionAmount: "200", // 200만원
            contributionFrequency: "분기",
            targetAnnualReturn: "5.0",
          },
        },
        totalMonthlyContribution: 166.67, // 만원 단위로 저장되어야 함
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
      expect(savedPlan!.totalMonthlyContribution).toBe(166.67); // 만원 단위
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
        totalMonthlyContribution: 100,
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
          1: {
            contributionAmount: "100",
            contributionFrequency: "월",
            targetAnnualReturn: "5.0",
          },
        },
        totalMonthlyContribution: 100,
        averageTargetReturn: 5.0,
      };

      addPlan(originalPlan);
      const plans = useAssetPlanStore.getState().plans;
      const planId = plans[0]!.id;

      updatePlan(planId, {
        planName: "수정된 계획",
        totalMonthlyContribution: 200, // 만원 단위
      });

      const updatedPlans = useAssetPlanStore.getState().plans;
      const updatedPlan = updatedPlans[0]!;

      expect(updatedPlan.planName).toBe("수정된 계획");
      expect(updatedPlan.totalMonthlyContribution).toBe(200); // 만원 단위
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
        totalMonthlyContribution: 100,
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
          1: {
            contributionAmount: "150",
            contributionFrequency: "월",
            targetAnnualReturn: "6.0",
          },
        },
        totalMonthlyContribution: 150, // 만원 단위
        averageTargetReturn: 6.0,
      };

      addPlan(planData);
      const plans = useAssetPlanStore.getState().plans;
      const planId = plans[0]!.id;

      const foundPlan = getPlanById(planId);
      expect(foundPlan).toBeDefined();
      expect(foundPlan!.planName).toBe("조회 테스트 계획");
      expect(foundPlan!.totalMonthlyContribution).toBe(150); // 만원 단위
    });

    it("존재하지 않는 ID로 조회 시 undefined를 반환해야 한다", () => {
      const { getPlanById } = useAssetPlanStore.getState();
      const foundPlan = getPlanById("non-existent-id");
      expect(foundPlan).toBeUndefined();
    });
  });

  describe("금액 단위 검증", () => {
    it("totalMonthlyContribution이 만원 단위로 저장되어야 한다", () => {
      const { addPlan } = useAssetPlanStore.getState();

      const planData = {
        planName: "단위 테스트",
        planPeriod: 10,
        accountPlans: {
          1: {
            contributionAmount: "100", // 100만원 입력
            contributionFrequency: "월",
            targetAnnualReturn: "7.0",
          },
          2: {
            contributionAmount: "300", // 300만원 입력
            contributionFrequency: "분기", // 분기당 300만원 = 월 100만원
            targetAnnualReturn: "5.0",
          },
        },
        totalMonthlyContribution: 200, // 100 + 100 = 200만원 (만원 단위)
        averageTargetReturn: 6.0,
      };

      addPlan(planData);
      const plans = useAssetPlanStore.getState().plans;
      const savedPlan = plans[0]!;

      // 저장된 값이 만원 단위인지 확인
      expect(savedPlan.totalMonthlyContribution).toBe(200);
      expect(savedPlan.accountPlans[1]!.contributionAmount).toBe("100");
      expect(savedPlan.accountPlans[2]!.contributionAmount).toBe("300");
    });

    it("다양한 납입 주기의 월 환산 금액이 만원 단위로 저장되어야 한다", () => {
      const { addPlan } = useAssetPlanStore.getState();

      // 월 100만원 + 분기 300만원(=월100만원) + 반기 600만원(=월100만원) + 연 1200만원(=월100만원)
      const planData = {
        planName: "다양한 주기 테스트",
        planPeriod: 10,
        accountPlans: {
          1: { contributionAmount: "100", contributionFrequency: "월", targetAnnualReturn: "7.0" },
          2: {
            contributionAmount: "300",
            contributionFrequency: "분기",
            targetAnnualReturn: "7.0",
          },
          3: {
            contributionAmount: "600",
            contributionFrequency: "반기",
            targetAnnualReturn: "7.0",
          },
          4: { contributionAmount: "1200", contributionFrequency: "년", targetAnnualReturn: "7.0" },
        },
        totalMonthlyContribution: 400, // 100 + 100 + 100 + 100 = 400만원
        averageTargetReturn: 7.0,
      };

      addPlan(planData);
      const plans = useAssetPlanStore.getState().plans;
      const savedPlan = plans[0]!;

      expect(savedPlan.totalMonthlyContribution).toBe(400); // 만원 단위
    });

    it("실제 plan 생성 시 계산되는 totalMonthlyContribution이 만원 단위여야 한다", () => {
      // 실제 UI에서 사용되는 것과 같은 방식으로 계산
      const accountPlans = {
        1: { contributionAmount: "100", contributionFrequency: "월", targetAnnualReturn: "7.0" },
        2: { contributionAmount: "200", contributionFrequency: "분기", targetAnnualReturn: "5.0" },
      };

      // getMonthlyContribution 함수 로직 복사 (만원 단위 유지)
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

      // 100만원(월) + 66.67만원(분기당 200만원 = 월 66.67만원) = 166.67만원
      expect(Math.round(totalMonthlyContribution * 100) / 100).toBe(166.67);

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

      // 저장된 값도 만원 단위로 유지되어야 함
      expect(Math.round(savedPlan.totalMonthlyContribution * 100) / 100).toBe(166.67);
    });
  });

  describe("데이터 타입 검증", () => {
    it("날짜 필드가 Date 객체여야 한다", () => {
      const { addPlan } = useAssetPlanStore.getState();

      addPlan({
        planName: "날짜 테스트",
        planPeriod: 5,
        accountPlans: {},
        totalMonthlyContribution: 100,
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
        totalMonthlyContribution: 150.5, // 소수점도 지원
        averageTargetReturn: 6.75,
      });

      const plans = useAssetPlanStore.getState().plans;
      const plan = plans[0]!;

      expect(typeof plan.planPeriod).toBe("number");
      expect(typeof plan.totalMonthlyContribution).toBe("number");
      expect(typeof plan.averageTargetReturn).toBe("number");
      expect(plan.totalMonthlyContribution).toBe(150.5);
      expect(plan.averageTargetReturn).toBe(6.75);
    });
  });
});
