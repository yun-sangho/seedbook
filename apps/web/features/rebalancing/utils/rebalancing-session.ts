import type {
  RebalancingResult,
  RebalancingSession,
  RebalancingTask,
  RebalancingTaskStatus,
} from "../types/types";

/** 대기 / 주문 (주문 수량·가격을 기록했고 아직 체결 전) / 체결. */
export function rebalancingTaskStatus(task: RebalancingTask): RebalancingTaskStatus {
  if (task.done) return "filled";
  if (isNumber(task.orderedQuantity) && isNumber(task.orderedPrice)) return "ordered";
  return "pending";
}

const isNumber = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined;

/**
 * 할 일 하나의 완료 여부를 뒤집는다. 체결을 취소하면 주문을 기록했었으면 주문 상태로, 아니면
 * 대기로 돌아간다 (`rebalancingTaskStatus`). 모두 체크해도 바로 완료되지 않는다 —
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

/** 매매를 다 하지 않고 끝낸(종료한) 리밸런싱. */
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

/** 화면의 매매 그룹 — 상태별로 나눈다. */
export type RebalancingTaskGroup = "pending" | "ordered";

/**
 * 할 일을 대기 / 주문 / 체결 그룹으로 나눈다 (각 그룹 안 순서는 원래 순서 그대로).
 *
 * `leaving` 은 방금 상태가 바뀌어 원래 그룹에서 빠지는 애니메이션 중인 할 일과 그 원래 그룹 —
 * 바뀐 모습을 잠깐 보여준 뒤 다음 그룹으로 옮기도록 그동안은 원래 그룹에 둔다.
 */
export function groupRebalancingTasks(
  tasks: RebalancingTask[],
  leaving: ReadonlyMap<string, RebalancingTaskGroup> = new Map()
): { pending: RebalancingTask[]; ordered: RebalancingTask[]; filled: RebalancingTask[] } {
  const groups = {
    pending: [] as RebalancingTask[],
    ordered: [] as RebalancingTask[],
    filled: [] as RebalancingTask[],
  };
  for (const t of tasks) groups[leaving.get(t.id) ?? rebalancingTaskStatus(t)].push(t);
  return groups;
}

/**
 * 증권사에 넣은 주문을 기록한다 (이미 주문했으면 값을 바꾼다). 체결한 할 일은 바꾸지 않는다 —
 * 체결을 먼저 취소한다.
 */
export function orderRebalancingTaskWith(
  session: RebalancingSession,
  taskId: string,
  orderedQuantity: number,
  orderedPrice: number
): RebalancingSession {
  return updateUnfilledTask(session, taskId, (t) => ({ ...t, orderedQuantity, orderedPrice }));
}

/** 주문을 취소해 대기로 돌린다. 체결한 할 일은 바꾸지 않는다. */
export function cancelRebalancingTaskOrder(
  session: RebalancingSession,
  taskId: string
): RebalancingSession {
  return updateUnfilledTask(session, taskId, (t) => ({
    ...t,
    orderedQuantity: null,
    orderedPrice: null,
  }));
}

function updateUnfilledTask(
  session: RebalancingSession,
  taskId: string,
  update: (task: RebalancingTask) => RebalancingTask
): RebalancingSession {
  if (isRebalancingCompleted(session)) return session;
  const target = session.tasks.find((t) => t.id === taskId);
  if (!target || target.done) return session;
  return { ...session, tasks: session.tasks.map((t) => (t.id === taskId ? update(t) : t)) };
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
