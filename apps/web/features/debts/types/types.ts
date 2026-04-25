/**
 * 대출 아이템 타입
 */
export interface DebtsItem {
  id: string;
  loanName: string;
  loanType: string; // 대출 유형 (주택담보, 신용대출 등)
  lender: string; // 대출 기관
  amount: number; // 원금 (원)
  interestRate: number; // 이자율 (%)
  maturityDate: string; // 만기일 (YYYY-MM-DD)
  monthlyPayment: number; // 월상환금 (원)
  note: string; // 메모
}
