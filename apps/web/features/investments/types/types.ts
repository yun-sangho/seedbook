/**
 * 투자 금액 기록 인터페이스 (히스토리용)
 */
export interface InvestmentRecord {
  date: string; // 기준날짜 (YYYY-MM-DD 형식)
  initialInvestment: number; // 투자원금
  currentValue: number; // 평가금액
}

/**
 * 보유 주식 인터페이스.
 *
 * `market` / `ticker` / `currency` 는 Stock 마스터(Prisma `Stock` 모델)
 * 에서 복제된 정보. 마스터 참조 무결성은 보장되지 않음 — holdings 는
 * 사용자가 직접 편집 가능한 localStorage 자료이기 때문.
 */
export interface StockHolding {
  id: string; // `crypto.randomUUID()` 로 생성된 UUID
  market: string; // "KOSPI" | "KOSDAQ" | 향후 "NASDAQ" 등. 비어있으면 레거시(이름만 있음).
  ticker: string; // 종목 티커. 비어있으면 레거시.
  name: string; // 종목명
  currency: string; // "KRW" | "USD". 비어있으면 레거시.
  quantity: number; // 보유 수량
  memo: string; // 메모
}

/**
 * 현금성 자산 항목 (예수금, CMA, MMF 등)
 */
export interface CashItem {
  id: string; // `crypto.randomUUID()` 로 생성된 UUID
  label: string; // 사용자 편집 가능 (기본값: "예수금")
  amount: number; // 원 단위
}

/**
 * 계좌 타입 인터페이스
 */
export interface InvestmentItem {
  id: string; // `crypto.randomUUID()` 로 생성된 UUID
  accountName: string;
  accountType: string;
  currency: string;
  initialInvestment: number; // 현재 투자원금
  currentValue: number; // 현재 평가금액
  records: InvestmentRecord[]; // 금액 변경 히스토리
  holdings: StockHolding[]; // 보유 주식 목록
  cashItems: CashItem[]; // 현금성 자산 목록
  note: string;
  color: string; // 차트 표시 색상
}
