"use client";

import { useSyncStatusStore } from "@web/features/settings/stores/sync-status-store";
import { getStorageMode } from "@web/lib/storage-mode";
import { AlertCircle, Check, CloudOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * 클라우드 저장 모드에서만 헤더에 노출되는 동기화 상태 뱃지.
 *
 * cloud 모드가 아니면 아무것도 렌더하지 않는다. `getStorageMode()` 는 SSR 에선
 * 항상 `local` 이므로, 클라이언트 마운트 이후에 한 번 체크한 뒤 유지한다.
 */
export function SyncIndicator() {
  const [isCloud, setIsCloud] = useState(false);
  const state = useSyncStatusStore((s) => s.state);
  const lastSyncedAt = useSyncStatusStore((s) => s.lastSyncedAt);

  useEffect(() => {
    setIsCloud(getStorageMode() === "cloud");
  }, []);

  if (!isCloud) return null;

  const { icon: Icon, label, tone } = describe(state, lastSyncedAt);

  return (
    <div
      className={`flex items-center gap-1.5 text-xs ${tone}`}
      role="status"
      aria-live="polite"
      title={label}
    >
      <Icon className={state === "saving" ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

function describe(
  state: ReturnType<typeof useSyncStatusStore.getState>["state"],
  lastSyncedAt: number | null
): {
  icon: typeof Check;
  label: string;
  tone: string;
} {
  switch (state) {
    case "saving":
      return { icon: Loader2, label: "저장 중...", tone: "text-muted-foreground" };
    case "offline":
      return { icon: CloudOff, label: "오프라인", tone: "text-yellow-600" };
    case "error":
      return { icon: AlertCircle, label: "저장 실패", tone: "text-red-600" };
    case "unauthenticated":
      return { icon: AlertCircle, label: "로그인 필요", tone: "text-red-600" };
    case "idle":
    default:
      return {
        icon: Check,
        label: lastSyncedAt ? "저장됨" : "클라우드 연결됨",
        tone: "text-green-600",
      };
  }
}
