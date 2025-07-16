// 저축 아이템 타입
export interface SavingsItem {
  id: number;
  accountName: string;
  accountType: string; // 저축 유형 (예금, 적금 등)
  accountOwner: string; // 계좌 소유자
  amount: number; // 금액 (원)
  note: string; // 메모
}
