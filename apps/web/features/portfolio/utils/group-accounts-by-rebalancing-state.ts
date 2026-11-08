import type { LinkedPortfolioStatus } from "./linked-portfolio-status";

/** 계좌 하나의 리밸런싱 상태. `unlinked` 는 연결된 포트폴리오가 없음. */
export type AccountRebalancingState = "needs-rebalancing" | "ok" | "unknown" | "unlinked";

/** 리밸런싱 목록에 보여줄 그룹 순서 — 손볼 것이 먼저. */
export const ACCOUNT_REBALANCING_STATE_ORDER: AccountRebalancingState[] = [
  "needs-rebalancing",
  "ok",
  "unknown",
  "unlinked",
];

/**
 * 연결된 포트폴리오 상태 중 가장 나쁜 것을 계좌 상태로 쓴다.
 * 하나라도 이격 초과면 초과, 아니면 정상이 하나라도 있으면 정상, 전부 판단 불가면 판단 불가.
 */
export function accountRebalancingState(
  statuses: LinkedPortfolioStatus[]
): AccountRebalancingState {
  if (statuses.length === 0) return "unlinked";
  if (statuses.some((s) => s.state === "needs-rebalancing")) return "needs-rebalancing";
  if (statuses.some((s) => s.state === "ok")) return "ok";
  return "unknown";
}

export interface AccountRebalancingGroup<T> {
  state: AccountRebalancingState;
  rows: T[];
}

/** 계좌 행을 상태별로 묶는다. 그룹 안에서는 입력 순서를 유지하고, 빈 그룹은 뺀다. */
export function groupAccountsByRebalancingState<T extends { statuses: LinkedPortfolioStatus[] }>(
  rows: T[]
): AccountRebalancingGroup<T>[] {
  const byState = new Map<AccountRebalancingState, T[]>(
    ACCOUNT_REBALANCING_STATE_ORDER.map((state) => [state, []])
  );
  for (const row of rows) {
    byState.get(accountRebalancingState(row.statuses))?.push(row);
  }
  return ACCOUNT_REBALANCING_STATE_ORDER.map((state) => ({
    state,
    rows: byState.get(state) ?? [],
  })).filter((g) => g.rows.length > 0);
}
