import type { RebalancingTask } from "../types/types";

/**
 * 진행 화면의 매매 묶음 — 하는 순서대로 1. 팔기 → 2. 사기, 끝난 거래는 맨 아래.
 * 순서는 권장일 뿐이라 어느 묶음의 매매든 언제나 열 수 있다.
 *
 * `leaving` 은 방금 거래가 끝나 사라지는 애니메이션 중인 매매 — 그동안은 원래 묶음에 둔다.
 * 각 묶음 안 순서는 원래 순서 그대로.
 */
export function groupTasksByStep(
  tasks: RebalancingTask[],
  leaving: ReadonlySet<string> = new Set()
): { sell: RebalancingTask[]; buy: RebalancingTask[]; done: RebalancingTask[] } {
  const groups = {
    sell: [] as RebalancingTask[],
    buy: [] as RebalancingTask[],
    done: [] as RebalancingTask[],
  };
  for (const t of tasks) {
    if (t.done && !leaving.has(t.id)) groups.done.push(t);
    else groups[t.action === "매도" ? "sell" : "buy"].push(t);
  }
  return groups;
}
