export type {
  RebalancingResult,
  RebalancingResultHolding,
  RebalancingSession,
  RebalancingTask,
  RebalancingTaskAction,
} from "@seedbook/domain/v1/rebalancing-types";

/** 할 일의 진행 상태: 대기 → 주문 → 체결. 주문을 건너뛰고 바로 체결할 수도 있다. */
export type RebalancingTaskStatus = "pending" | "ordered" | "filled";
