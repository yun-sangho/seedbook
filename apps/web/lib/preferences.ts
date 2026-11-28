import {
  type AccountPreferences,
  parseAccountPreferences,
} from "@web/features/settings/utils/account-preferences";
import { accountFetch } from "@web/lib/account-storage";
import { usePreferencesStore } from "@web/lib/preferences-store";

/**
 * 계정에 저장된 화면 설정을 서버에서 받아온다. 로그인하지 않았거나 실패하면 null —
 * 이 기기에 남아 있는 값을 그대로 쓴다. 알아볼 수 없는 항목은 빼고 돌려준다.
 */
export async function fetchPreferences(): Promise<AccountPreferences | null> {
  try {
    const res = await accountFetch("/api/me/preferences", { credentials: "include" });
    if (!res.ok) return null;
    return parseAccountPreferences(await res.json());
  } catch {
    return null;
  }
}

/** 설정 일부를 계정에 저장한다. 실패는 조용히 넘긴다 — 이 기기에는 이미 반영돼 있다. */
async function pushPreferences(changes: AccountPreferences): Promise<void> {
  try {
    await accountFetch("/api/me/preferences", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(changes),
    });
  } catch {
    // 네트워크 실패 — 다음에 바꿀 때 다시 저장된다.
  }
}

/** 화면 설정을 바꾼다 — 이 기기(캐시)에 바로 반영하고 계정에 저장한다. */
export function savePreferences(changes: AccountPreferences): Promise<void> {
  usePreferencesStore.getState().applyPreferences({ ...changes });
  return pushPreferences(changes);
}
