import type { RebalancingTask } from "../types/types";

/**
 * 진행 중 리밸런싱의 매매 정렬.
 * - `nameAsc` / `nameDesc`: 종목명 오름 / 내림차순 — 한글을 영문보다 큰 값으로 본다
 * - `evalDesc` / `evalAsc`: 평가액(지금 보유 수량 × 시작 시점 기준 가격) 높은 / 낮은 순
 */
export type RebalancingTaskSort = "nameAsc" | "nameDesc" | "evalDesc" | "evalAsc";

export const DEFAULT_REBALANCING_TASK_SORT: RebalancingTaskSort = "nameDesc";

const TASK_SORTS: readonly RebalancingTaskSort[] = ["nameDesc", "nameAsc", "evalDesc", "evalAsc"];

/** 서버·저장소에서 읽은 값이 정렬 옵션인지 (없어진 옵션이나 다른 값은 거른다). */
export function isRebalancingTaskSort(value: unknown): value is RebalancingTaskSort {
  return typeof value === "string" && (TASK_SORTS as readonly string[]).includes(value);
}

/** 매도를 먼저 해야 매수할 예수금이 생긴다 — 어떤 정렬이든 매도가 매수보다 먼저. */
const ACTION_RANK: Record<RebalancingTask["action"], number> = { 매도: 0, 매수: 1 };

/**
 * 매도 → 매수로 묶고 그 안에서 옵션대로 정렬한다. 값이 같으면 원래 순서를 지킨다.
 * `holdingQuantity` 는 그 종목의 지금 보유 수량. 원래 배열은 바꾸지 않는다.
 */
export function sortRebalancingTasks(
  tasks: RebalancingTask[],
  option: RebalancingTaskSort,
  holdingQuantity: (task: RebalancingTask) => number
): RebalancingTask[] {
  const order = new Map(tasks.map((t, i) => [t.id, i]));
  const evaluation = (t: RebalancingTask) => holdingQuantity(t) * (t.price ?? 0);
  const compare = (a: RebalancingTask, b: RebalancingTask): number => {
    switch (option) {
      case "nameAsc":
        return compareNames(a.name || a.ticker, b.name || b.ticker);
      case "nameDesc":
        return compareNames(b.name || b.ticker, a.name || a.ticker);
      case "evalDesc":
        return evaluation(b) - evaluation(a);
      case "evalAsc":
        return evaluation(a) - evaluation(b);
    }
  };
  return [...tasks].sort(
    (a, b) =>
      ACTION_RANK[a.action] - ACTION_RANK[b.action] ||
      compare(a, b) ||
      (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );
}

/** 이름 비교. 숫자는 값으로 비교한다 (예: "50" 이 "200" 보다 앞). */
const NAME_COLLATOR = new Intl.Collator("ko", { numeric: true });
const HANGUL = /[ㄱ-ㆎ가-힣]/;

/**
 * 종목명 비교 (오름차순 기준). 한글을 영문(숫자·기호 포함)보다 큰 값으로 본다 — 앞에서부터
 * 처음 다른 글자가 한글과 영문이면 영문이 작다 (예: "TIGER CD…" < "TIGER 미국채…").
 * 같은 종류끼리면 한국어 정렬로 비교한다.
 */
function compareNames(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] === b[i]) continue;
    const aHangul = HANGUL.test(a[i]!);
    const bHangul = HANGUL.test(b[i]!);
    if (aHangul !== bHangul) return aHangul ? 1 : -1;
    break;
  }
  return NAME_COLLATOR.compare(a, b);
}
