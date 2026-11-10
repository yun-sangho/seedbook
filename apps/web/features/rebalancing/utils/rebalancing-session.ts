import type { RebalancingResult, RebalancingSession, RebalancingTask } from "../types/types";

/**
 * 할 일 하나의 완료 여부를 뒤집는다. 모두 체크해도 바로 완료되지 않는다 —
 * 사용자가 "리밸런싱 완료하기"(`completeRebalancing`)를 눌러야 기록으로 넘어간다
 * (다 체크하지 않아도 완료할 수 있다).
 * 완료된 리밸런싱은 (계좌에 반영됐을 수 있으므로) 더 이상 바꾸지 않는다.
 */
export function toggleRebalancingTask(
  session: RebalancingSession,
  taskId: string
): RebalancingSession {
  if (isRebalancingCompleted(session)) return session;
  if (!session.tasks.some((t) => t.id === taskId)) return session;
  return {
    ...session,
    tasks: session.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
  };
}

/**
 * 진행 중이면 언제든 완료할 수 있다 — 매매를 다 하지 않았어도 된다.
 * 체크하지 않은 매매는 체크하지 않은 채로 기록에 남는다.
 */
export function canCompleteRebalancing(session: RebalancingSession): boolean {
  return !isRebalancingCompleted(session);
}

/**
 * 진행 중인 리밸런싱을 완료 기록으로 넘긴다. 이미 완료됐으면 그대로 돌려준다.
 * 계좌에 반영했으면 반영 후 구성(`result`)을 함께 남긴다.
 */
export function completeRebalancing(
  session: RebalancingSession,
  nowIso: string,
  result: RebalancingResult | null = null
): RebalancingSession {
  if (!canCompleteRebalancing(session)) return session;
  return { ...session, completedAt: nowIso, result };
}

export function isRebalancingCompleted(session: RebalancingSession): boolean {
  return session.completedAt !== null;
}

/** 매매를 다 하지 않고 끝낸(중지한) 리밸런싱. */
export function isRebalancingStopped(session: RebalancingSession): boolean {
  return isRebalancingCompleted(session) && session.tasks.some((t) => !t.done);
}

export function rebalancingProgress(session: RebalancingSession): { done: number; total: number } {
  return {
    done: session.tasks.filter((t) => t.done).length,
    total: session.tasks.length,
  };
}

/** 계좌에 진행 중인 리밸런싱 (한 계좌에 하나만 진행한다). */
export function findInProgressForAccount(
  sessions: RebalancingSession[],
  accountId: string
): RebalancingSession | undefined {
  return sessions.find((s) => s.accountId === accountId && !isRebalancingCompleted(s));
}

/**
 * 화면에 보일 할 일. 진행 중에는 남은 것만 보여 주고 (모두 체크했으면 빈 목록),
 * 전체 보기를 켰거나 완료된 리밸런싱이면 전부 보여 준다.
 */
export function visibleRebalancingTasks(
  session: RebalancingSession,
  showAll: boolean
): RebalancingTask[] {
  if (showAll || isRebalancingCompleted(session)) return session.tasks;
  return session.tasks.filter((t) => !t.done);
}

/** 진행 중인 리밸런싱이 있는 계좌 id. 이런 계좌는 새 리밸런싱을 시작할 수 없다. */
export function inProgressAccountIds(sessions: RebalancingSession[]): Set<string> {
  return new Set(sessions.filter((s) => !isRebalancingCompleted(s)).map((s) => s.accountId));
}

/**
 * 할 일을 "남은 매매" 와 "완료" 그룹으로 나눈다 (각 그룹 안 순서는 원래 순서 그대로).
 *
 * `leavingIds` 는 방금 체크해 남은 목록에서 빠지는 애니메이션 중인 할 일 — 체크된 모습을
 * 잠깐 보여준 뒤 완료 그룹으로 옮기도록 그동안은 남은 매매에 둔다.
 */
export function groupRebalancingTasks(
  tasks: RebalancingTask[],
  leavingIds: ReadonlySet<string> = new Set()
): { remaining: RebalancingTask[]; done: RebalancingTask[] } {
  const remaining: RebalancingTask[] = [];
  const done: RebalancingTask[] = [];
  for (const t of tasks) {
    if (!t.done || leavingIds.has(t.id)) remaining.push(t);
    else done.push(t);
  }
  return { remaining, done };
}

/**
 * 할 일을 실제로 사고판 수량·가격과 함께 완료로 기록한다. 이미 완료한 할 일이면 기록한 값을
 * 바꾼다. 권장 수량(`quantity`)과 시작 시점 가격(`price`)은 그대로 두어 비교할 수 있게 한다.
 * 가격을 주지 않으면 이미 기록한 가격(없으면 기록하지 않음)을 유지한다.
 */
export function completeRebalancingTaskWith(
  session: RebalancingSession,
  taskId: string,
  executedQuantity: number,
  executedPrice?: number
): RebalancingSession {
  if (isRebalancingCompleted(session)) return session;
  if (!session.tasks.some((t) => t.id === taskId)) return session;
  return {
    ...session,
    tasks: session.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            done: true,
            executedQuantity,
            ...(executedPrice !== undefined ? { executedPrice } : {}),
          }
        : t
    ),
  };
}

/** 실제로 사고판 수량. 완료하지 않았으면 null, 수량 없이 체크했으면 권장 수량. */
export function executedQuantityOf(task: RebalancingTask): number | null {
  if (!task.done) return null;
  return task.executedQuantity ?? task.quantity;
}

/** 실제로 사고판 가격 (주당). 완료하지 않았으면 null, 가격 없이 체크했으면 시작 시점 가격. */
export function executedPriceOf(task: RebalancingTask): number | null {
  if (!task.done) return null;
  return task.executedPrice ?? task.price;
}

/** 종목을 이번 리밸런싱에서 사고판 가격 — 그 종목의 완료한 매매가 없으면 null. */
export function executedPriceFor(
  tasks: RebalancingTask[],
  market: string,
  ticker: string
): number | null {
  for (const task of tasks) {
    if (task.market !== market || task.ticker !== ticker) continue;
    const price = executedPriceOf(task);
    if (price !== null) return price;
  }
  return null;
}
