"use client";

import { useEffect } from "react";
import { switchTab } from "@mobile/app/_stack/stack-control";
import { usePortfolioStore } from "@mobile/features/portfolio/stores/portfolio-store";
import { useRebalancingStore } from "@mobile/features/rebalancing/stores/rebalancing-store";
import { rebalancingTaskStatus } from "@mobile/features/rebalancing/utils/rebalancing-session";
import { isNativeAppUserAgent } from "@mobile/lib/device";
import {
  onNotificationTap,
  registerPushDevice,
  scheduleReminders,
} from "@mobile/lib/native/notifications";
import { getStorageMode } from "@mobile/lib/storage-mode";
import { enabledServerKinds, plantNotificationLabel } from "@seedbook/domain/notifications";
import {
  currentNotificationSettings,
  useNotificationSettingsStore,
} from "../stores/notification-settings-store";
import { notificationTarget } from "../utils/notification-links";
import { type DriftSource, planReminders, type RebalancingSource } from "../utils/reminder-plan";

/** 권한을 새로 받았을 때(알림 안내·설정 화면) 등록·예약을 다시 하라는 이벤트. */
export const NOTIFICATIONS_CHANGED_EVENT = "seedbook:notifications-changed";

/** 입력하는 동안 매번 다시 예약하지 않도록, 마지막 변경 뒤 이만큼 기다린다. */
const RESCHEDULE_DELAY_MS = 2_000;

function driftSources(): DriftSource[] {
  return usePortfolioStore
    .getState()
    .portfolios.flatMap((p) =>
      p.driftSince
        ? [{ label: plantNotificationLabel(p.plantName, p.name), driftSince: p.driftSince }]
        : []
    );
}

function rebalancingSources(): RebalancingSource[] {
  return useRebalancingStore.getState().sessions.flatMap((s) =>
    s.completedAt === null
      ? [
          {
            label: s.accountName || s.portfolioName,
            startedAt: s.startedAt,
            remaining: s.tasks.filter((t) => rebalancingTaskStatus(t) !== "filled").length,
          },
        ]
      : []
  );
}

/**
 * 네이티브 앱 알림 (`@seedbook/domain/notifications`). 알림은 클라우드 저장(cloud 모드)에서만 받는다.
 *
 *   - 원격 푸시(목표 도달): 앱을 열 때와 설정을 바꿀 때 기기 토큰과 켠 종류를 서버에 등록한다 (권한이 있을 때만).
 *   - 로컬 알림(비중 이탈 n일째·리밸런싱 할 일 남음): 앱을 열 때, 다시 볼 때, 포트폴리오·리밸런싱·설정이 바뀔 때
 *     다시 계획해 예약을 바꾼다. local 모드면 예약을 모두 지운다.
 *
 * store 가 하이드레이션된 뒤(`HydrationGate` 안)에 그린다. 브라우저에서는 아무것도 하지 않는다.
 */
export function NotificationRunner() {
  // 알림을 눌러 열면 그 알림의 화면으로 (저장 위치와 상관없이 — 예약이 남아 있던 알림도).
  useEffect(() => {
    if (!isNativeAppUserAgent(window.navigator.userAgent)) return;
    let detach: (() => void) | null = null;
    let cancelled = false;
    void onNotificationTap((kind) => switchTab(notificationTarget(kind).tab)).then((remove) => {
      if (cancelled) remove();
      else detach = remove;
    });
    return () => {
      cancelled = true;
      detach?.();
    };
  }, []);

  useEffect(() => {
    if (!isNativeAppUserAgent(window.navigator.userAgent)) return;
    if (getStorageMode() !== "cloud") {
      void scheduleReminders([]);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const reschedule = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const reminders = planReminders({
        settings: currentNotificationSettings(),
        drifts: driftSources(),
        rebalancings: rebalancingSources(),
        now: new Date(),
      });
      void scheduleReminders(reminders);
    };
    const later = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(reschedule, RESCHEDULE_DELAY_MS);
    };
    const register = () =>
      void registerPushDevice(enabledServerKinds(currentNotificationSettings()));

    register();
    reschedule();

    const unsubscribes = [
      usePortfolioStore.subscribe((state, previous) => {
        if (state.portfolios !== previous.portfolios) later();
      }),
      useRebalancingStore.subscribe((state, previous) => {
        if (state.sessions !== previous.sessions) later();
      }),
      useNotificationSettingsStore.subscribe((state, previous) => {
        if (state.goal !== previous.goal) register();
        reschedule();
      }),
    ];
    // 기기 설정에서 알림을 끄고 돌아오면 서버 등록을 지운다 (켜고 돌아오면 다시 등록).
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      register();
      reschedule();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const onChanged = () => {
      register();
      reschedule();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);

    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      for (const unsubscribe of unsubscribes) unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
