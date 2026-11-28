"use client";

import { createAccountStateStorage } from "@mobile/lib/account-storage";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  readNotificationSettings,
} from "@seedbook/domain/notifications";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * 이 기기에서 받을 알림 종류·시각 (`@seedbook/domain/notifications`). 기기마다 따로 고른다 — 동기화하지 않고
 * 계정별 기기 저장소에 둔다. 서버가 보내는 종류(목표 도달)는 기기 등록 때 서버에 알린다
 * (`components/notification-runner.tsx`).
 */
interface NotificationSettingsState extends NotificationSettings {
  update: (changes: Partial<NotificationSettings>) => void;
}

export const useNotificationSettingsStore = create<NotificationSettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      update: (changes) => {
        const { update: _, ...current } = get();
        set(readNotificationSettings({ ...current, ...changes }));
      },
    }),
    {
      name: "seedbook.notifications",
      storage: createJSONStorage(() => createAccountStateStorage()),
      version: 1,
      partialize: ({ update: _, ...settings }) => settings,
      merge: (persisted, current) => ({ ...current, ...readNotificationSettings(persisted) }),
    }
  )
);

/** 지금 설정 (함수 없이). */
export function currentNotificationSettings(): NotificationSettings {
  const { update: _, ...settings } = useNotificationSettingsStore.getState();
  return settings;
}
