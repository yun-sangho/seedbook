"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconLockLine } from "@karrotmarket/react-monochrome-icon";
import { useBiometryLabel } from "@mobile/hooks/use-biometry-label";
import { getDeviceStorage } from "@mobile/lib/device-storage";
import {
  APP_LOCK_GRACE_MS,
  appSessionStorage,
  clearAppLockSeen,
  isAppLockEnabled,
  readAppLockSeen,
  recordAppLockSeen,
  setAppLockEnabled,
  shouldLockOnLaunch,
  shouldLockOnReturn,
} from "@mobile/lib/native/app-lock";
import { BIOMETRY_WITH_RO, verifyBiometric } from "@mobile/lib/native/biometric";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import { ListButtonItem } from "@mobile/seed-design/ui/list";
import { Icon } from "@seed-design/react";

const UNLOCK_REASON = "자산 정보를 보려면 잠금을 해제하세요";
const GRACE_MINUTES = APP_LOCK_GRACE_MS / 60_000;

/**
 * 앱 잠금 화면. 네이티브 앱에서 잠금을 켰을 때만 동작한다 — 앱을 새로 띄우거나 백그라운드에
 * `APP_LOCK_GRACE_MS` 이상 있다가 돌아오면 화면 전체를 가리고 생체 인증을 요청한다
 * (`lib/native/app-lock.ts`). 페이지만 다시 로드된 경우(로그인 직후, 새로고침)는 잠금이 풀린 화면이
 * 유예 시간 안에 보였으면 다시 잠그지 않는다.
 */
export function AppLockOverlay() {
  const biometryLabel = useBiometryLabel();
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const verifyingRef = useRef(false);

  const lock = useCallback(() => {
    lockedRef.current = true;
    setLocked(true);
    clearAppLockSeen(appSessionStorage());
  }, []);

  const unlock = useCallback(async () => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    const passed = await verifyBiometric(UNLOCK_REASON);
    verifyingRef.current = false;
    if (!passed) return;
    lockedRef.current = false;
    setLocked(false);
    recordAppLockSeen(appSessionStorage(), Date.now());
  }, []);

  // 페이지를 새로 그렸을 때: 생체 인증을 쓸 수 있고 잠금이 켜져 있으면, 잠금이 풀린 화면이 유예 시간
  // 안에 보인 적이 없을 때만 잠근다.
  useEffect(() => {
    if (!biometryLabel) return;
    const lockNow = shouldLockOnLaunch({
      enabled: isAppLockEnabled(getDeviceStorage()),
      lastSeenAt: readAppLockSeen(appSessionStorage()),
      now: Date.now(),
    });
    if (lockNow) {
      lock();
      void unlock();
    }
  }, [biometryLabel, lock, unlock]);

  useEffect(() => {
    if (!biometryLabel) return;
    // 잠금이 풀린 화면이 가려지는 시각을 남긴다. 잠금 해제 중에 뜨는 인증 시트도 hidden 을 보낼 수 있다.
    const noteSeen = () => {
      if (!lockedRef.current && !verifyingRef.current) {
        recordAppLockSeen(appSessionStorage(), Date.now());
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        noteSeen();
        return;
      }
      if (lockedRef.current) return;
      const lockNow = shouldLockOnReturn({
        enabled: isAppLockEnabled(getDeviceStorage()),
        hiddenAt: readAppLockSeen(appSessionStorage()),
        now: Date.now(),
      });
      if (lockNow) {
        lock();
        void unlock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", noteSeen);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", noteSeen);
    };
  }, [biometryLabel, lock, unlock]);

  if (!locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="앱 잠금"
      data-covers-tab-bar=""
      className="bg-bg-layer-default fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-x4 p-x6 text-center"
    >
      <Icon svg={<IconLockLine />} size="x10" />
      <div className="flex flex-col gap-x1">
        <p className="t6-bold">Seedbook 이 잠겨 있어요</p>
        <p className="t4-regular text-fg-neutral-subtle">{UNLOCK_REASON}</p>
      </div>
      <ActionButton size="large" onClick={unlock}>
        {biometryLabel ? BIOMETRY_WITH_RO[biometryLabel] : ""} 잠금 해제
      </ActionButton>
    </div>
  );
}

/**
 * 설정 메뉴의 "앱 잠금" 항목. 네이티브 앱에서 생체 인증을 쓸 수 있을 때만 보인다.
 * 켤 때는 먼저 인증을 한 번 통과해야 한다 (본인 기기에서 켜는지 확인).
 */
export function AppLockSettingItem() {
  const biometryLabel = useBiometryLabel();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isAppLockEnabled(getDeviceStorage()));
  }, []);

  if (!biometryLabel) return null;

  const toggle = async () => {
    if (enabled) {
      setAppLockEnabled(getDeviceStorage(), false);
      setEnabled(false);
      return;
    }
    const passed = await verifyBiometric(`${BIOMETRY_WITH_RO[biometryLabel]} 앱 잠금을 켭니다`);
    if (!passed) return;
    recordAppLockSeen(appSessionStorage(), Date.now());
    setAppLockEnabled(getDeviceStorage(), true);
    setEnabled(true);
  };

  return (
    <ListButtonItem
      prefix={<Icon svg={<IconLockLine />} />}
      title={`${BIOMETRY_WITH_RO[biometryLabel]} 앱 잠금`}
      detail={enabled ? `켜짐 · 앱을 열거나 ${GRACE_MINUTES}분 넘게 떠나 있으면 잠겨요` : "꺼짐"}
      onClick={toggle}
    />
  );
}
