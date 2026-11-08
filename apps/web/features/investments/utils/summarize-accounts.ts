import { calculateReturnRate } from "@web/utils/number-format";
import type { InvestmentItem } from "../types/types";

export interface AccountsSummary {
  /** 투자원금 합 (원) */
  initial: number;
  /** 평가금액 합 (원) */
  current: number;
  profit: number;
  /** 수익률 (%) */
  returnRate: number;
}

/** 계좌들의 평가금액·투자원금 합과 수익·수익률. 홈과 포트폴리오 상세가 같은 계산을 쓴다. */
export function summarizeAccounts(accounts: InvestmentItem[]): AccountsSummary {
  const initial = accounts.reduce((sum, inv) => sum + (inv.initialInvestment || 0), 0);
  const current = accounts.reduce((sum, inv) => sum + (inv.currentValue || 0), 0);
  return {
    initial,
    current,
    profit: current - initial,
    returnRate: calculateReturnRate(current, initial),
  };
}
