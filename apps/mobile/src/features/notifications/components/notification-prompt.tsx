"use client";

import { useEffect, useState } from "react";
import { usePortfolioStore } from "@mobile/features/portfolio/stores/portfolio-store";
import { accountStorage } from "@mobile/lib/account-storage";
import { isNativeAppUserAgent } from "@mobile/lib/device";
import {
  notificationPermission,
  requestNotificationPermission,
} from "@mobile/lib/native/notifications";
import { getStorageMode } from "@mobile/lib/storage-mode";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import {
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogRoot,
  AlertDialogTitle,
} from "@mobile/seed-design/ui/alert-dialog";
import { NOTIFICATIONS_CHANGED_EVENT } from "./notification-runner";

/** 알림을 물어봤다는 표시 (계정별 기기 저장소). 한 번만 묻는다 — 그 뒤로는 설정에서 켠다. */
export const NOTIFICATION_PROMPTED_KEY = "seedbook.notifications.prompted";
/** 화면이 자리 잡은 뒤에 묻는다 (심기 연출·다른 안내와 겹치지 않게). */
const PROMPT_DELAY_MS = 1_500;

function hasPlantedSeed(): boolean {
  return usePortfolioStore
    .getState()
    .portfolios.some((p) => p.goalAmount !== null || p.growthStage > 0 || p.stageGoals.length > 0);
}

/**
 * 첫 씨앗을 심은 뒤 한 번 "목표에 닿으면 알려 드릴까요?" 를 묻고, 받기를 고르면 시스템 권한 팝업을 띄운다.
 * 네이티브 앱·클라우드 저장·권한을 아직 정하지 않았을 때만. 다른 안내(생체 인증 로그인 등)가 떠 있으면 다음
 * 기회(포트폴리오가 바뀌거나 앱을 다시 볼 때)로 미룬다.
 */
export function NotificationPrompt() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isNativeAppUserAgent(window.navigator.userAgent)) return;
    if (getStorageMode() !== "cloud") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    const check = () => {
      if (done || timer || accountStorage.getItem(NOTIFICATION_PROMPTED_KEY)) return;
      if (!hasPlantedSeed()) return;
      timer = setTimeout(() => {
        timer = null;
        if (document.querySelector('[role="alertdialog"]')) return;
        void notificationPermission().then((permission) => {
          if (done) return;
          if (permission !== "prompt") {
            // 이미 정했으면(설정 앱에서 바꿨거나 예전에 답했으면) 묻지 않는다.
            if (permission !== "unavailable")
              accountStorage.setItem(NOTIFICATION_PROMPTED_KEY, "1");
            return;
          }
          done = true;
          setOpen(true);
        });
      }, PROMPT_DELAY_MS);
    };

    check();
    const unsubscribe = usePortfolioStore.subscribe(check);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      done = true;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const close = () => {
    accountStorage.setItem(NOTIFICATION_PROMPTED_KEY, "1");
    setOpen(false);
  };

  const allow = async () => {
    setBusy(true);
    await requestNotificationPermission();
    setBusy(false);
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    close();
  };

  return (
    <AlertDialogRoot open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>목표에 닿으면 알려 드릴까요?</AlertDialogTitle>
          <AlertDialogDescription>
            평가금액이 다음 목표에 닿았을 때와 비중이 기준을 오래 벗어났을 때 알려 드려요. 설정에서
            언제든 바꿀 수 있어요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <div className="flex w-full gap-x2">
            <AlertDialogAction variant="neutralWeak" size="large" flexGrow onClick={close}>
              나중에
            </AlertDialogAction>
            <ActionButton
              variant="neutralSolid"
              size="large"
              flexGrow
              loading={busy}
              onClick={allow}
            >
              알림 받기
            </ActionButton>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  );
}
