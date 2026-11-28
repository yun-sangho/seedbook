import { type Database, schema } from "@seedbook/database";
import {
  type AccountPreferences,
  DEFAULT_ACCOUNT_PREFERENCES,
  parseAccountPreferences,
} from "@web/features/settings/utils/account-preferences";

/**
 * 사용자 화면 설정 (`user_preference`, 사용자당 한 행). 저장소 모드(local/cloud)와 상관없이
 * 계정에 저장해 어느 기기에서 로그인해도 같은 설정을 쓴다.
 */

/** 모든 화면 설정. 고른 적이 없거나 없어진 옵션이면 기본값. */
export async function readAccountPreferences(
  db: Database,
  userId: string
): Promise<Required<AccountPreferences>> {
  const row = await db.query.userPreference.findFirst({
    where: (t, { eq }) => eq(t.userId, userId),
    columns: {
      rebalancingTaskSort: true,
      rebalancingCollapsedSections: true,
      accountSortOption: true,
      portfolioStockSortOption: true,
      holdingsSortOption: true,
    },
  });
  return { ...DEFAULT_ACCOUNT_PREFERENCES, ...parseAccountPreferences(row) };
}

/** 준 설정만 바꾼다 — 같은 행의 다른 값(저장소 모드)은 그대로. */
export async function writeAccountPreferences(
  db: Database,
  userId: string,
  changes: AccountPreferences
): Promise<void> {
  if (Object.keys(changes).length === 0) return;
  await db
    .insert(schema.userPreference)
    .values({ userId, ...changes })
    .onConflictDoUpdate({ target: schema.userPreference.userId, set: changes });
}
