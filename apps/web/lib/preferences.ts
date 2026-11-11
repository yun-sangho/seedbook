import {
  parseCollapsedSections,
  type RebalancingTaskSection,
} from "@web/features/rebalancing/utils/collapsed-sections";
import {
  isRebalancingTaskSort,
  type RebalancingTaskSort,
} from "@web/features/rebalancing/utils/sort-rebalancing-tasks";

export interface AccountPreferences {
  rebalancingTaskSort?: RebalancingTaskSort;
  rebalancingCollapsedSections?: RebalancingTaskSection[];
}

/**
 * 계정에 저장된 개인 설정을 서버에서 받아온다. 로그인하지 않았거나 실패하면 null —
 * 이 기기에 남아 있는 값을 그대로 쓴다. 알아볼 수 없는 항목은 빼고 돌려준다.
 */
export async function fetchPreferences(): Promise<AccountPreferences | null> {
  try {
    const res = await fetch("/api/me/preferences", { credentials: "include" });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      rebalancingTaskSort?: unknown;
      rebalancingCollapsedSections?: unknown;
    };
    const sections = parseCollapsedSections(body.rebalancingCollapsedSections);
    return {
      ...(isRebalancingTaskSort(body.rebalancingTaskSort)
        ? { rebalancingTaskSort: body.rebalancingTaskSort }
        : {}),
      ...(sections ? { rebalancingCollapsedSections: sections } : {}),
    };
  } catch {
    return null;
  }
}

/** 설정 일부를 계정에 저장한다. 실패는 조용히 넘긴다 — 이 기기에는 이미 반영돼 있다. */
async function pushPreferences(changes: AccountPreferences): Promise<void> {
  try {
    await fetch("/api/me/preferences", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(changes),
    });
  } catch {
    // 네트워크 실패 — 다음에 바꿀 때 다시 저장된다.
  }
}

/** 매매 정렬을 계정에 저장한다. */
export function pushRebalancingTaskSort(sort: RebalancingTaskSort): Promise<void> {
  return pushPreferences({ rebalancingTaskSort: sort });
}

/** 접어 둔 매매 섹션을 계정에 저장한다. */
export function pushRebalancingCollapsedSections(
  sections: RebalancingTaskSection[]
): Promise<void> {
  return pushPreferences({ rebalancingCollapsedSections: sections });
}
