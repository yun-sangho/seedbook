/**
 * 주식 종목 마스터 (클라이언트 타입).
 *
 * 서버(Prisma) `Stock` 모델과 별도로 클라이언트 번들에 `@prisma/client` 가
 * 섞이는 것을 피하기 위해 순수 interface 로 복제한다.
 *
 * `market` / `currency` 는 유니온이 아닌 `string` 으로 열어두어
 * 추후 NASDAQ/NYSE 등 해외 시장이 추가되어도 타입 수정이 필요 없도록 한다.
 */
export interface Stock {
  market: string; // "KOSPI" | "KOSDAQ" | 향후 "NASDAQ" | "NYSE" 등
  ticker: string;
  name: string;
  currency: string; // "KRW" | "USD"
}

export interface StockSearchResponse {
  results: Stock[];
}
