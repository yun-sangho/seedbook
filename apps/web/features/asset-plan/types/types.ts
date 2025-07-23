export interface AssetPlan {
  id: string;
  planName: string;
  planPeriod: number; // 계획 기간 (년)
  createdAt: Date;
  updatedAt: Date;
  accountPlans: {
    [accountId: number]: {
      contributionAmount: string; // 만원 단위
      contributionFrequency: string; // 월/분기/반기/년
      targetAnnualReturn: string;
    };
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
