import type { RebalancingSession } from "../types/types";
import {
  isRebalancingCompleted,
  rebalancingProgress,
  rebalancingTaskStatus,
} from "./rebalancing-session";

export interface InProgressBanner {
  /** 한 건이면 그 리밸런싱, 여러 건이면 null (목록으로 보낸다) */
  sessionId: string | null;
  /** 모두 체결해 "완료하기" 만 남음. 여러 건이면 전부 그럴 때만. */
  readyToComplete: boolean;
  title: string;
  description: string;
}

/**
 * 홈의 "진행 중인 리밸런싱 이어가기" 배너 내용. 진행 중인 것이 없으면 null.
 * `accountNames` 는 지금 계좌 이름 (계좌 id → 이름). 지워진 계좌는 시작할 때의 이름을 쓴다.
 */
export function inProgressBanner(
  sessions: RebalancingSession[],
  accountNames: ReadonlyMap<string, string>
): InProgressBanner | null {
  const active = sessions.filter((s) => !isRebalancingCompleted(s));
  const [first] = active;
  if (!first) return null;

  const nameOf = (s: RebalancingSession) =>
    accountNames.get(s.accountId) || s.accountName || "이름 없는 계좌";
  const readyCount = active.filter(isReadyToComplete).length;
  const readyToComplete = readyCount === active.length;

  if (active.length === 1) {
    return {
      sessionId: first.id,
      readyToComplete,
      title: readyToComplete ? "리밸런싱 완료만 남았어요" : "진행 중인 리밸런싱 이어가기",
      description: `${nameOf(first)} · ${progressText(first, readyToComplete)}`,
    };
  }

  const names = active.map(nameOf).join(", ");
  const someReady = readyCount > 0 && !readyToComplete;
  return {
    sessionId: null,
    readyToComplete,
    title: readyToComplete
      ? `리밸런싱 ${active.length}건, 완료만 남았어요`
      : `진행 중인 리밸런싱 ${active.length}건 이어가기`,
    description: someReady ? `${names} · ${readyCount}건은 완료만 남았어요` : names,
  };
}

function isReadyToComplete(session: RebalancingSession): boolean {
  const { done, total } = rebalancingProgress(session);
  return total > 0 && done === total;
}

function progressText(session: RebalancingSession, ready: boolean): string {
  const { done, total } = rebalancingProgress(session);
  if (ready) return `매매 ${total}건을 모두 체결했어요`;
  const ordered = session.tasks.filter((t) => rebalancingTaskStatus(t) === "ordered").length;
  const progress = `매매 ${total}건 중 ${done}건 체결`;
  return ordered > 0 ? `${progress}, ${ordered}건 주문 중` : progress;
}
