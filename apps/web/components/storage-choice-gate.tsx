"use client";

import { type ReactNode, useEffect, useState } from "react";
import { StorageChoiceScreen } from "@web/components/storage-choice-screen";
import { fetchPendingStorageChoice, type PendingStorageChoice } from "@web/lib/storage-choice";
import { Loader2 } from "lucide-react";

/**
 * 저장 방식을 고른 적 없는 계정이면 앱 대신 선택 화면을 보여 준다 (새·기존 사용자 모두 한 번).
 * 확인하지 못하면 앱을 연다 — 저장 방식은 서버 값 그대로라 다음에 물어도 된다.
 */
export function StorageChoiceGate({
  children,
  pending,
}: {
  children: ReactNode;
  /** 이미 확인한 결과 (`OnboardingGate`). 주면 다시 묻지 않는다. null 이면 앱을 연다. */
  pending?: PendingStorageChoice | null;
}) {
  const [state, setState] = useState<"loading" | "open" | PendingStorageChoice>(
    pending === undefined ? "loading" : (pending ?? "open")
  );

  useEffect(() => {
    if (pending !== undefined) return;
    let cancelled = false;
    void fetchPendingStorageChoice().then((pending) => {
      if (!cancelled) setState(pending ?? "open");
    });
    return () => {
      cancelled = true;
    };
  }, [pending]);

  if (state === "open") return <>{children}</>;
  if (state !== "loading") {
    return <StorageChoiceScreen current={state.current} onDone={() => setState("open")} />;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-screen h-screen flex items-center justify-center"
    >
      <Loader2 className="w-6 h-6 animate-spin text-fg-neutral-subtle" />
      <span className="sr-only">저장 방식을 확인하는 중...</span>
    </div>
  );
}
