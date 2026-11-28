"use client";

import { type ReactNode, useEffect, useState } from "react";
import { checkUpdateRequired, storeUrlFor } from "@mobile/lib/app-update";
import { isBundledApp } from "@mobile/lib/native/bundled-app";
import { useHideSplash } from "@mobile/lib/native/splash";
import { ActionButton } from "@mobile/seed-design/ui/action-button";

/**
 * 앱 강제 업데이트 (`lib/app-update.ts`). 번들 앱이 시작할 때와 다시 앞으로 올 때 서버의
 * `minSupportedVersion` 을 확인하고, 이 앱이 그보다 낮으면 앱 대신 업데이트 화면을 보인다.
 * 확인을 기다리지 않고 앱을 먼저 그린다 — 오프라인 시작을 늦추지 않는다.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const [required, setRequired] = useState(false);

  useEffect(() => {
    if (!isBundledApp()) return;
    let cancelled = false;
    const check = () => {
      void checkUpdateRequired().then((result) => {
        if (!cancelled) setRequired(result);
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (required) return <UpdateRequiredScreen storeUrl={storeUrlFor(navigator.userAgent)} />;
  return <>{children}</>;
}

export function UpdateRequiredScreen({ storeUrl }: { storeUrl: string | null }) {
  useHideSplash();
  return (
    <main className="bg-bg-layer-default text-fg-neutral flex h-dvh w-full flex-col items-center justify-center gap-x4 p-x6 text-center">
      <h1 className="t7-bold">업데이트가 필요해요</h1>
      <p className="t5-regular text-fg-neutral-muted break-keep">
        이 버전은 더 이상 쓸 수 없어요. 스토어에서 최신 버전으로 업데이트해 주세요. 기기에 저장한
        데이터는 그대로 남아 있어요.
      </p>
      {storeUrl && (
        <ActionButton asChild variant="neutralSolid" size="large">
          <a href={storeUrl} target="_blank" rel="noreferrer">
            업데이트하기
          </a>
        </ActionButton>
      )}
    </main>
  );
}
