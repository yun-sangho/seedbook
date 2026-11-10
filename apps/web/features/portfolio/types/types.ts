/**
 * 포트폴리오 종목 비중 항목.
 *
 * 한 종목에 대한 목표 비중(%)을 정의한다. 실제 보유 수량/금액은 별도
 * `features/investments` 데이터에서 산출하며, 여기서는 보관하지 않는다.
 */
export interface PortfolioAllocation {
  id: string; // `crypto.randomUUID()` 로 생성
  market: string; // "KOSPI" | "KOSDAQ"
  ticker: string;
  name: string;
  currency: string; // "KRW"
  targetPercent: number; // 0~100, 소수 허용 (예: 12.5)
}

/**
 * 이격률 계산 방식.
 * - `relative`: 목표 비중의 % — (현재 − 목표) ÷ 목표. 목표 20% → 현재 25% 면 25%.
 * - `absolute`: 비중 차이 (%p) — 현재 − 목표. 목표 20% → 현재 25% 면 5%.
 */
export type DriftMode = "relative" | "absolute";

/**
 * 모델 포트폴리오 정의.
 *
 * 사용자가 원하는 자산 배분(allocations) + 메타데이터를 묶는 단위.
 * asset-plan 처럼 여러 개를 만들고 비교할 수 있다.
 */
export interface PortfolioItem {
  id: string;
  name: string; // "안정형", "공격형", "AI 테마" 등
  color: string; // ACCOUNT_COLORS 에서 자동 할당
  allocations: PortfolioAllocation[];
  /**
   * 이 포트폴리오가 적용되는 `InvestmentItem.id` 목록.
   * 빈 배열이면 적용 계좌가 없는 것 — 리밸런싱 비교가 불가능한 상태.
   */
  accountIds: string[];
  /** 이격률 계산 방식 (`driftThresholdPercent` 를 이 방식으로 잰 값과 비교한다). */
  driftMode: DriftMode;
  /**
   * 이격률 경고 임계값 (%). `driftMode` 로 잰 |이격률| 이 이 값보다 크면 이격 초과로 판정.
   * 매수/매도 action 판정용 임계값과는 별개 (그쪽은 `DEFAULT_REBALANCE_THRESHOLD_PERCENT`).
   */
  driftThresholdPercent: number;
  note: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/**
 * 종목 검색 결과를 store 액션으로 넘길 때 쓰는 부분 타입.
 * `Stock` 타입과 호환되지만 cross-feature 의존을 줄이기 위해 별도 정의.
 */
export interface StockSelection {
  market: string;
  ticker: string;
  name: string;
  currency: string;
}
