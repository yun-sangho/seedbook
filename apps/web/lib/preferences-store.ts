"use client";

import {
  type AccountPreferences,
  DEFAULT_ACCOUNT_PREFERENCES,
  parseAccountPreferences,
} from "@web/features/settings/utils/account-preferences";
import { createAccountStateStorage } from "@web/lib/account-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * 화면 설정 (정렬·접힘, `AccountPreferences`). 기준값은 계정(`/api/me/preferences`)이고,
 * 이 기기에는 첫 화면을 바로 그리기 위한 캐시로만 남긴다 — 로그인하면 `PreferencesSync` 가 계정
 * 값으로 맞춘다. 바꿀 때는 `savePreferences` (`lib/preferences.ts`) 로 캐시와 계정에 함께 저장한다.
 *
 * 데이터 store 와 달리 엔티티 동기화·저장소 모드(local/cloud)와 무관해 기기 저장소에 직접 둔다
 * (브라우저 localStorage, 앱은 SQLite `user_preference`).
 */
interface PreferencesState extends Required<AccountPreferences> {
  /** 알아볼 수 있는 항목만 반영한다 — 예전 캐시나 서버에서 온 없어진 옵션은 무시한다. */
  applyPreferences: (changes: Record<string, unknown>) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_ACCOUNT_PREFERENCES,
      applyPreferences: (changes) => set(parseAccountPreferences(changes)),
    }),
    {
      name: "seedbook.preferences",
      storage: createJSONStorage(() => createAccountStateStorage()),
      version: 1,
      partialize: ({ applyPreferences: _, ...prefs }) => prefs,
      // 캐시에 없거나 이상한 값은 기본값을 그대로 둔다.
      merge: (persisted, current) => ({ ...current, ...parseAccountPreferences(persisted) }),
    }
  )
);
