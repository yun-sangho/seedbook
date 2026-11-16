"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconLockLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { getDeviceStorage } from "@web/lib/device-storage";
import { isAppLockEnabled, setAppLockEnabled, shouldLockOnReturn } from "@web/lib/native/app-lock";
import {
  availableBiometryLabel,
  BIOMETRY_WITH_RO,
  type BiometryName,
  verifyBiometric,
} from "@web/lib/native/biometric";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { ListButtonItem } from "@web/seed-design/ui/list";

const UNLOCK_REASON = "자산 정보를 보려면 잠금을 해제하세요";

/** 이 기기에서 쓸 수 있는 생체 인증 이름. 브라우저·미지원 기기면 null. */
function useBiometryLabel(): BiometryName | null {
  const [label, setLabel] = useState<BiometryName | null>(null);
  useEffect(() => {
    let cancelled = false;
    availableBiometryLabel().then((value) => {
      if (!cancelled) setLabel(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return label;
}

/**
 * 앱 잠금 화면. 네이티브 앱에서 잠금을 켰을 때만 동작한다 — 앱을 새로 열거나 백그라운드에
 * 오래 있다가 돌아오면 화면 전체를 가리고 생체 인증을 요청한다 (`lib/native/app-lock.ts`).
 */
export function AppLockOverlay() {
  const biometryLabel = useBiometryLabel();
  const [locked, setLocked] = useState(false);
  const hiddenAtRef = useRef<number | null>(null);
  const verifyingRef = useRef(false);

  const unlock = useCallback(async () => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    const passed = await verifyBiometric(UNLOCK_REASON);
    verifyingRef.current = false;
    if (passed) setLocked(false);
  }, []);

  // 앱을 새로 띄웠을 때: 생체 인증을 쓸 수 있고 잠금이 켜져 있으면 잠근다.
  useEffect(() => {
    if (biometryLabel && isAppLockEnabled(getDeviceStorage())) {
      setLocked(true);
      void unlock();
    }
  }, [biometryLabel, unlock]);

  useEffect(() => {
    if (!biometryLabel) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // 인증 시트가 떠 있는 동안에도 hidden 이 올 수 있어 그때는 기록하지 않는다.
        if (!verifyingRef.current) hiddenAtRef.current = Date.now();
        return;
      }
      const lockNow = shouldLockOnReturn({
        enabled: isAppLockEnabled(getDeviceStorage()),
        hiddenAt: hiddenAtRef.current,
        now: Date.now(),
      });
      hiddenAtRef.current = null;
      if (lockNow) {
        setLocked(true);
        void unlock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [biometryLabel, unlock]);

  if (!locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="앱 잠금"
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
 * 더보기 시트의 "앱 잠금" 항목. 네이티브 앱에서 생체 인증을 쓸 수 있을 때만 보인다.
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
    setAppLockEnabled(getDeviceStorage(), true);
    setEnabled(true);
  };

  return (
    <ListButtonItem
      prefix={<Icon svg={<IconLockLine />} />}
      title={`${BIOMETRY_WITH_RO[biometryLabel]} 앱 잠금`}
      detail={enabled ? "켜짐 · 앱을 열 때 잠금 해제가 필요해요" : "꺼짐"}
      onClick={toggle}
    />
  );
}
