/**
 * 계좌 타입 인터페이스
 */
export interface InvestmentItem {
  id: number;
  accountName: string;
  accountType: string;
  accountOwner: string;
  currency: string;
  currentValue: number;
  initialInvestment: number | undefined; // 투자원금
  note: string;
}
