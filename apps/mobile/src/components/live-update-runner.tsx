"use client";

import { useEffect } from "react";
import { getLiveUpdate } from "@mobile/lib/native/live-update";

/** 다시 앞으로 올 때 확인하는 최소 간격. 시작할 때는 늘 확인한다. */
const RESUME_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * OTA 번들 업데이트 (`lib/native/live-update.ts`). 저장소가 열리고 화면을 그릴 수 있게 된 뒤
 * (`HydrationGate` 안) 정상 부팅을 알리고(`ready()` — 못 알리면 플러그인이 내장 번들로 되돌린다), 받을
 * 번들을 확인한다. 다시 앞으로 올 때도 확인한다. 번들 앱이 아니거나 플러그인이 없으면 아무것도 하지 않는다.
 */
export function LiveUpdateRunner() {
  useEffect(() => {
    let cancelled = false;
    let lastCheck = 0;
    const check = async () => {
      const liveUpdate = await getLiveUpdate();
      if (!liveUpdate || cancelled) return;
      lastCheck = Date.now();
      await liveUpdate.check();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheck < RESUME_CHECK_INTERVAL_MS) return;
      void check();
    };
    void (async () => {
      const liveUpdate = await getLiveUpdate();
      if (!liveUpdate) return;
      await liveUpdate.markReady().catch((error: unknown) => {
        console.warn("[live-update] ready 실패", error);
      });
      if (!cancelled) await check();
    })();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return null;
}
