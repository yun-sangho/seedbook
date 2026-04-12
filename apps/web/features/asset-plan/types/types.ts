/**
 * 플랜에 포함되는 계좌별 계획 항목.
 *
 * `accountKind` discriminator 는 해당 accountId 가 투자 계좌인지 저축 계좌인지
 * 구분한다. 두 스토어가 서로 독립이라 타입 레벨 FK 는 불가능하고, 서버 측
 * `AssetPlanAccountItem` 테이블에도 같은 discriminator 컬럼이 있다.
 */
export interface AssetPlanAccountItem {
  contributionAmount: string; // 원 단위 문자열 (콤마 포함 가능)
  contributionFrequency: string; // 월 | 분기 | 반기 | 년
  targetAnnualReturn: string;
  accountKind: "investment" | "savings";
}

export interface AssetPlan {
  id: string;
  planName: string;
  planPeriod: number; // 계획 기간 (년)
  createdAt: Date;
  updatedAt: Date;
  accountPlans: {
    [accountId: string]: AssetPlanAccountItem;
  };
  // 계산된 값들
  totalMonthlyContribution: number;
  averageTargetReturn: number;
}

export interface AssetPlanStore {
  plans: AssetPlan[];
  addPlan: (plan: Omit<AssetPlan, "id" | "createdAt" | "updatedAt">) => void;
  updatePlan: (id: string, plan: Partial<AssetPlan>) => void;
  deletePlan: (id: string) => void;
  getPlanById: (id: string) => AssetPlan | undefined;
}
