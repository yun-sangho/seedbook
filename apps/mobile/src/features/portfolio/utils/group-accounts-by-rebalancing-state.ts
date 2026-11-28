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

/** 계좌의 리밸런싱 상태 — 연결된 포트폴리오의 상태를 따르고, 연결이 없으면 `unlinked`. */
export function accountRebalancingState(
  status: LinkedPortfolioStatus | null
): AccountRebalancingState {
  return status?.state ?? "unlinked";
}

export interface AccountRebalancingGroup<T> {
  state: AccountRebalancingState;
  rows: T[];
}

/** 계좌 행을 상태별로 묶는다. 그룹 안에서는 입력 순서를 유지하고, 빈 그룹은 뺀다. */
export function groupAccountsByRebalancingState<T extends { status: LinkedPortfolioStatus | null }>(
  rows: T[]
): AccountRebalancingGroup<T>[] {
  const byState = new Map<AccountRebalancingState, T[]>(
    ACCOUNT_REBALANCING_STATE_ORDER.map((state) => [state, []])
  );
  for (const row of rows) {
    byState.get(accountRebalancingState(row.status))?.push(row);
  }
  return ACCOUNT_REBALANCING_STATE_ORDER.map((state) => ({
    state,
    rows: byState.get(state) ?? [],
  })).filter((g) => g.rows.length > 0);
}
