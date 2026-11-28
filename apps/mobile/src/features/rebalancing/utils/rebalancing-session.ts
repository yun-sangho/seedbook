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
 * 체결을 먼저 취소한다. 부분 체결된 주문은 이미 체결된 수량보다 많게만 정정할 수 있다.
 */
export function orderRebalancingTaskWith(
  session: RebalancingSession,
  taskId: string,
  orderedQuantity: number,
  orderedPrice: number
): RebalancingSession {
  const target = session.tasks.find((t) => t.id === taskId);
  if (target && orderedQuantity <= filledQuantityOf(target)) return session;
  return updateUnfilledTask(session, taskId, (t) => ({ ...t, orderedQuantity, orderedPrice }));
}

/**
 * 주문을 취소한다. 체결된 것이 없으면 대기로 돌아가고, 부분 체결됐으면 잔량만 취소해 체결된
 * 수량·평균가로 체결을 마친다 (잔량 취소). 체결한 할 일은 바꾸지 않는다.
 */
export function cancelRebalancingTaskOrder(
  session: RebalancingSession,
  taskId: string
): RebalancingSession {
  return updateUnfilledTask(session, taskId, (t) =>
    isPartiallyFilled(t)
      ? finishFill(t, filledQuantityOf(t), t.filledAmount ?? 0)
      : { ...t, orderedQuantity: null, orderedPrice: null }
  );
}

/**
 * 주문의 체결을 기록한다 (주문 중인 할 일만). 이번 체결과 앞선 부분 체결을 합쳐 주문 수량에 못
 * 미치면 부분 체결로 쌓고 잔량은 주문 중으로 둔다. 주문 수량을 채우면(넘어도) 합친 수량과 평균가로
 * 체결을 마친다 — 앞선 부분 체결 기록은 남겨 두어 체결을 취소하면 부분 체결 상태로 돌아간다.
 */
export function fillRebalancingTaskOrder(
  session: RebalancingSession,
  taskId: string,
  quantity: number,
  price: number
): RebalancingSession {
  const target = session.tasks.find((t) => t.id === taskId);
  if (!target || rebalancingTaskStatus(target) !== "ordered") return session;
  return updateUnfilledTask(session, taskId, (t) => {
    const filledQuantity = filledQuantityOf(t) + quantity;
    const filledAmount = (t.filledAmount ?? 0) + quantity * price;
    if (filledQuantity < (t.orderedQuantity ?? 0)) return { ...t, filledQuantity, filledAmount };
    return finishFill(t, filledQuantity, filledAmount);
  });
}

/** 합친 수량·금액으로 체결을 마친다. 체결 가격은 평균가 (금액 ÷ 수량). */
function finishFill(task: RebalancingTask, quantity: number, amount: number): RebalancingTask {
  return { ...task, done: true, executedQuantity: quantity, executedPrice: amount / quantity };
}

/** 부분 체결로 지금까지 체결된 수량 (주). 부분 체결이 없었으면 0. */
export function filledQuantityOf(task: RebalancingTask): number {
  return task.filledQuantity ?? 0;
}

/**
 * 일부만 거래된 할 일 — 거래된 만큼은 거래한 것으로 보고 나머지는 남아 있다. 주문 없이 체결을
 * 바로 기록해도(`recordRebalancingFill`), 예전 주문의 부분 체결이어도 같다.
 */
export function isPartiallyFilled(task: RebalancingTask): boolean {
  return !task.done && filledQuantityOf(task) > 0;
}

/**
 * 할 일의 목표 수량 (주) — 시작할 때 계산한 권장 수량. 시세를 몰라 권장 수량이 없으면 예전에
 * 기록한 주문 수량, 그것도 없으면 null (목표를 모르면 한 번 기록하면 끝난다).
 */
export function targetQuantityOf(task: RebalancingTask): number | null {
  return task.quantity ?? task.orderedQuantity ?? null;
}

/** 목표까지 남은 수량 (주). 끝난 할 일은 0, 목표를 모르면 null. */
export function remainingQuantityOf(task: RebalancingTask): number | null {
  if (task.done) return 0;
  const target = targetQuantityOf(task);
  return target === null ? null : Math.max(0, target - filledQuantityOf(task));
}

/**
 * 실제로 거래된 체결 한 건을 기록한다 (주문 없이 — 증권사 앱에서 거래된 수량·가격 그대로).
 * 앞선 체결과 합쳐 목표 수량에 못 미치면 남은 수량을 두고 열어 둔다. 목표를 채우면(넘어도) 합친
 * 수량과 평균가로 끝낸다 — 앞선 체결 기록은 남겨 두어 끝낸 것을 되돌리면 그 상태로 돌아간다.
 */
export function recordRebalancingFill(
  session: RebalancingSession,
  taskId: string,
  quantity: number,
  price: number
): RebalancingSession {
  return updateUnfilledTask(session, taskId, (t) => {
    const filledQuantity = filledQuantityOf(t) + quantity;
    const filledAmount = (t.filledAmount ?? 0) + quantity * price;
    const target = targetQuantityOf(t);
    if (target !== null && filledQuantity < target) return { ...t, filledQuantity, filledAmount };
    return finishFill(t, filledQuantity, filledAmount);
  });
}

/**
 * 남은 수량은 거래하지 않고 할 일을 끝낸다 ("남은 n주는 안 팔래요"). 거래된 것이 있으면 그 수량·
 * 평균가로, 없으면 거래하지 않은 것(0주)으로 끝낸다.
 */
export function closeRebalancingTask(
  session: RebalancingSession,
  taskId: string
): RebalancingSession {
  return updateUnfilledTask(session, taskId, (t) =>
    isPartiallyFilled(t)
      ? finishFill(t, filledQuantityOf(t), t.filledAmount ?? 0)
      : { ...t, done: true, executedQuantity: 0, executedPrice: null }
  );
}

/** 열려 있는 할 일의 체결 기록을 지운다 (잘못 기록했을 때 처음부터 다시). */
export function clearRebalancingFills(
  session: RebalancingSession,
  taskId: string
): RebalancingSession {
  return updateUnfilledTask(session, taskId, (t) => ({ ...t, filledQuantity: 0, filledAmount: 0 }));
}

/** 아직 체결되지 않은 주문 수량 (주). 주문 중이 아니면 0. */
export function remainingOrderQuantity(task: RebalancingTask): number {
  if (rebalancingTaskStatus(task) !== "ordered") return 0;
  return Math.max(0, (task.orderedQuantity ?? 0) - filledQuantityOf(task));
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

/**
 * 실제로 사고판 수량. 부분 체결된 주문이면 지금까지 체결된 수량, 체결하지 않았으면 null,
 * 수량 없이 체크했으면 권장 수량.
 */
export function executedQuantityOf(task: RebalancingTask): number | null {
  if (!task.done) return isPartiallyFilled(task) ? filledQuantityOf(task) : null;
  return task.executedQuantity ?? task.quantity;
}

/**
 * 실제로 사고판 가격 (주당). 부분 체결된 주문이면 지금까지 체결된 평균가, 체결하지 않았으면
 * null, 가격 없이 체크했으면 시작 시점 가격.
 */
export function executedPriceOf(task: RebalancingTask): number | null {
  if (!task.done) {
    return isPartiallyFilled(task) ? (task.filledAmount ?? 0) / filledQuantityOf(task) : null;
  }
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
