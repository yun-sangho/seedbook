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
  /** 예상 수량 (주). 가격이 없으면 null */
  quantity: number | null;
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
}
