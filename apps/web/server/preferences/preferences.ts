import { schema, type Database } from "@seedbook/database";
import {
  DEFAULT_REBALANCING_TASK_SORT,
  isRebalancingTaskSort,
  type RebalancingTaskSort,
} from "@web/features/rebalancing/utils/sort-rebalancing-tasks";

/**
 * 사용자 개인 설정 (`user_preference`, 사용자당 한 행). 저장소 모드(local/cloud)와 상관없이
 * 계정에 저장해 어느 기기에서 로그인해도 같은 설정을 쓴다.
 */

/** 진행 중 리밸런싱의 매매 정렬. 고른 적이 없거나 없어진 옵션이면 기본값. */
export async function readRebalancingTaskSort(
  db: Database,
  userId: string
): Promise<RebalancingTaskSort> {
  const row = await db.query.userPreference.findFirst({
    where: (t, { eq }) => eq(t.userId, userId),
    columns: { rebalancingTaskSort: true },
  });
  const value = row?.rebalancingTaskSort;
  return isRebalancingTaskSort(value) ? value : DEFAULT_REBALANCING_TASK_SORT;
}

/** 매매 정렬만 바꾼다 — 같은 행의 다른 설정(저장소 모드, 보유 주식 정렬)은 그대로. */
export async function writeRebalancingTaskSort(
  db: Database,
  userId: string,
  sort: RebalancingTaskSort
): Promise<void> {
  await db
    .insert(schema.userPreference)
    .values({ userId, rebalancingTaskSort: sort })
    .onConflictDoUpdate({
      target: schema.userPreference.userId,
      set: { rebalancingTaskSort: sort },
    });
}
