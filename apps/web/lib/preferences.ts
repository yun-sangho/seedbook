import {
  isRebalancingTaskSort,
  type RebalancingTaskSort,
} from "@web/features/rebalancing/utils/sort-rebalancing-tasks";

/**
 * 계정에 저장된 개인 설정을 서버에서 받아온다. 로그인하지 않았거나 실패하면 null —
 * 이 기기에 남아 있는 값을 그대로 쓴다.
 */
export async function fetchPreferences(): Promise<{
  rebalancingTaskSort: RebalancingTaskSort;
} | null> {
  try {
    const res = await fetch("/api/me/preferences", { credentials: "include" });
    if (!res.ok) return null;
    const body = (await res.json()) as { rebalancingTaskSort?: unknown };
    return isRebalancingTaskSort(body.rebalancingTaskSort)
      ? { rebalancingTaskSort: body.rebalancingTaskSort }
      : null;
  } catch {
    return null;
  }
}

/** 매매 정렬을 계정에 저장한다. 실패는 조용히 넘긴다 — 이 기기에는 이미 반영돼 있다. */
export async function pushRebalancingTaskSort(sort: RebalancingTaskSort): Promise<void> {
  try {
    await fetch("/api/me/preferences", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rebalancingTaskSort: sort }),
    });
  } catch {
    // 네트워크 실패 — 다음에 바꿀 때 다시 저장된다.
  }
}
