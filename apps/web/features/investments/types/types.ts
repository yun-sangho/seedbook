/**
 * 투자 금액 기록 인터페이스
 */
export interface InvestmentRecord {
  date: string; // 기준날짜 (YYYY-MM-DD 형식)
  initialInvestment: number; // 투자원금
  currentValue: number; // 평가금액
}

/**
 * 계좌 타입 인터페이스
 */
export interface InvestmentItem {
  id: number;
  accountName: string;
  accountType: string;
  accountOwner: string;
  currency: string;
  records: InvestmentRecord[]; // 금액 기록 배열
  note: string;
}
