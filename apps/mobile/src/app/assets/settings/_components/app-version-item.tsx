"use client";

import { useEffect, useRef, useState } from "react";
import { IconILowercaseSerifCircleLine } from "@karrotmarket/react-monochrome-icon";
import { APP_VERSION } from "@mobile/lib/app-update";
import { getLiveUpdate, type LiveUpdate } from "@mobile/lib/native/live-update";
import { ListButtonItem } from "@mobile/seed-design/ui/list";
import { Icon } from "@seed-design/react";
import type { AppBundleChannel } from "@seedbook/domain/app-bundle";

/** 숨은 beta 채널 토글: 버전 줄을 이만큼 연달아 누른다. */
const TAPS_TO_TOGGLE = 7;
/** 연달아 누른 것으로 보는 간격. */
const TAP_WINDOW_MS = 1500;

/**
 * 앱 버전 (설정 > 정보, OTA 를 쓰는 번들 앱만). 지금 쓰는 번들의 빌드도 같이 보인다 — 어느 화면 버전인지
 * 물을 때 쓴다. 숨은 기능: 7번 연달아 누르면 OTA 채널을 beta ↔ production 으로 바꾼다 (내부 테스터용,
 * 다음 확인부터 적용, `lib/native/live-update.ts`).
 */
export function AppVersionItem() {
  const [liveUpdate, setLiveUpdate] = useState<LiveUpdate | null>(null);
  const [channel, setChannel] = useState<AppBundleChannel | null>(null);
  const taps = useRef<{ count: number; at: number }>({ count: 0, at: 0 });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await getLiveUpdate();
      const current = (await found?.channel().catch(() => null)) ?? null;
      if (cancelled || !current) return;
      setLiveUpdate(found);
      setChannel(current);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!liveUpdate || !channel) return null;

  const build = (process.env.SEEDBOOK_APP_BUILD ?? "").slice(0, 7);
  const detail = [build && `빌드 ${build}`, channel === "beta" && "베타 업데이트 받는 중"]
    .filter(Boolean)
    .join(" · ");

  const onTap = async () => {
    const now = Date.now();
    const next = now - taps.current.at < TAP_WINDOW_MS ? taps.current.count + 1 : 1;
    taps.current = { count: next, at: now };
    if (next < TAPS_TO_TOGGLE) return;
    taps.current = { count: 0, at: 0 };
    const toggled: AppBundleChannel = channel === "beta" ? "production" : "beta";
    await liveUpdate.setChannel(toggled);
    setChannel(toggled);
    void liveUpdate.check();
  };

  return (
    <ListButtonItem
      prefix={<Icon svg={<IconILowercaseSerifCircleLine />} />}
      title={`버전 ${APP_VERSION}`}
      detail={detail || undefined}
      onClick={() => void onTap()}
    />
  );
}
