import type { RebalancingTaskGroup } from "@web/features/rebalancing/utils/rebalancing-session";

/**
 * 매매 입력 페이지에서 방금 상태를 바꾼 매매 id 와 원래 그룹 (대기 → 주문, 대기/주문 → 체결).
 * 리밸런싱 화면으로 돌아오면 그 매매가 원래 그룹에서 접히며 빠지는 모습을 보여주려고 잠깐
 * 들고 있는다 (화면 사이 일회성 신호라 store 에 두지 않는다).
 */
const pending = new Map<string, RebalancingTaskGroup>();

export function markJustMoved(taskId: string, from: RebalancingTaskGroup): void {
  pending.set(taskId, from);
}

/** 아직 보여주지 않은 방금 옮긴 매매의 원래 그룹 — 렌더 중에 읽어 바로 옮기지 않게 한다. */
export function justMovedFrom(taskId: string): RebalancingTaskGroup | undefined {
  return pending.get(taskId);
}

/** 방금 옮긴 매매를 꺼내고 비운다 — 빠지는 애니메이션을 시작할 때 한 번 부른다. */
export function takeJustMoved(): [string, RebalancingTaskGroup][] {
  const entries = [...pending];
  pending.clear();
  return entries;
}
