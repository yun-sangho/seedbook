import type { StockPriceKind } from "@web/features/investments/utils/use-stock-prices";

/**
 * 리밸런싱 할 일 한 건 — 종목 하나를 사거나 판다.
 *
 * 시작 시점의 권장 매매를 그대로 스냅샷한다. 이후 시세가 바뀌어도 할 일은 바뀌지 않는다.
 */
export interface RebalancingTask {
  /** 포트폴리오 allocation id (세션 안에서 유일) */
  id: string;
  market: string;
  ticker: string;
  name: string;
  action: RebalancingTaskAction;
  /** 사고팔 금액 (원, 양수) */
  amount: number;
  /** 시작 시점 종가 (원). 시세가 없었으면 null */
  price: number | null;
  /** 권장 수량 (주). 시작 시점 가격으로 고정. 가격이 없으면 null */
  quantity: number | null;
  /**
   * 실제로 사고판 수량 (주) — 완료할 때 입력한다. 이 필드가 생기기 전에 체크한 할 일은 권장
   * 수량대로 거래한 것으로 본다 (`executedQuantityOf`).
   */
  executedQuantity?: number | null;
  /**
   * 실제로 사고판 가격 (원, 주당) — 완료할 때 입력한다. 예수금은 이 가격으로 계산한다.
   * 이 필드가 생기기 전에 체크한 할 일은 시작 시점 가격(`price`)으로 거래한 것으로 본다
   * (`executedPriceOf`).
   */
  executedPrice?: number | null;
  /** `price` 의 기준 시각 (ISO). 가격이 없거나 기록 전에 시작한 리밸런싱이면 null */
  priceAsOf: string | null;
  /** `price` 가 장중 시세인지 종가인지. `priceAsOf` 와 함께 null */
  priceKind: StockPriceKind | null;
  done: boolean;
}

export type RebalancingTaskAction = "매수" | "매도";

/**
 * 계좌 하나에 대해 시작한 리밸런싱.
 *
 * `completedAt` 이 null 이면 진행 중, 아니면 완료된 기록이다. 계좌/포트폴리오가 지워져도
 * 기록을 보여줄 수 있도록 이름을 함께 보관한다.
 */
export interface RebalancingSession {
  id: string;
  accountId: string;
  accountName: string;
  portfolioId: string;
  portfolioName: string;
  /** 시작할 때 입력한 현금 투입(+)/인출(-) 금액 (원) */
  cashDelta: number;
  tasks: RebalancingTask[];
  startedAt: string; // ISO timestamp
  completedAt: string | null; // ISO timestamp
  /**
   * 완료하며 계좌에 반영한 뒤의 포트폴리오 구성 스냅샷. 계좌에 반영하지 않았거나
   * 이 필드가 생기기 전에 완료한 기록이면 null (없을 수도 있다).
   */
  result?: RebalancingResult | null;
}

/** 리밸런싱 결과의 포트폴리오 종목 한 줄 (목표 순서). */
export interface RebalancingResultHolding {
  market: string;
  ticker: string;
  name: string;
  /** 반영 후 보유 수량 (주) */
  quantity: number;
  /** 이번 리밸런싱으로 바뀐 수량 (주). 매수 +, 매도 - */
  change: number;
  /** 포트폴리오 종목 + 예수금 중 비중 (%). 가격을 몰랐으면 null */
  percent: number | null;
  targetPercent: number;
}

export interface RebalancingResult {
  holdings: RebalancingResultHolding[];
  /** 반영 후 예수금 합 (원) */
  cash: number;
  /** 반영 전 예수금 합 (원). 이 필드가 생기기 전에 완료한 기록이면 없다. */
  cashBefore?: number | null;
  cashPercent: number | null;
}
