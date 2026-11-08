import type { RebalancingSession } from "../types/types";

/**
 * 할 일 하나의 완료 여부를 뒤집는다. 모두 끝나면 `completedAt` 을 찍어 기록으로 넘기고,
 * 완료된 리밸런싱에서 하나라도 되돌리면 다시 진행 중이 된다.
 */
export function toggleRebalancingTask(
  session: RebalancingSession,
  taskId: string,
  nowIso: string
): RebalancingSession {
  if (!session.tasks.some((t) => t.id === taskId)) return session;
  const tasks = session.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
  const allDone = tasks.length > 0 && tasks.every((t) => t.done);
  return {
    ...session,
    tasks,
    completedAt: allDone ? (session.completedAt ?? nowIso) : null,
  };
}

export function isRebalancingCompleted(session: RebalancingSession): boolean {
  return session.completedAt !== null;
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
