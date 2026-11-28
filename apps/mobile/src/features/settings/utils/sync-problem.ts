import type { StorageMode } from "@mobile/lib/storage-mode";
import type { SyncStatus } from "@mobile/lib/sync/v2/engine";

/** 마지막 동기화 성공에서 이만큼 지나면 홈에 알린다 (설계 §5.8 권장 기본값). */
export const SYNC_STALE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 홈에 알릴 동기화 문제 (설계 §5.8, cloud 모드만). 잠깐의 실패(네트워크·5xx·서버가 앱보다 옛 버전)는
 * 3일 조건으로만 드러난다. 건수·목록은 보여 주지 않는다.
 */
export type SyncProblem = "update_required" | "quarantine" | "stale";

export function syncProblem(
  status: SyncStatus | null,
  mode: StorageMode,
  now: Date
): SyncProblem | null {
  if (mode !== "cloud" || !status) return null;
  if (status.stoppedReason === "update_required") return "update_required";
  if (status.hasQuarantine) return "quarantine";
  const since = Date.parse(status.lastSuccessAt ?? status.startedAt);
  if (Number.isFinite(since) && now.getTime() - since > SYNC_STALE_MS) return "stale";
  return null;
}

export const SYNC_PROBLEM_TITLES: Record<SyncProblem, string> = {
  stale: "며칠째 동기화되지 않았어요",
  update_required: "업데이트하면 동기화가 다시 켜져요",
  quarantine: "일부 변경을 저장하지 못했어요",
};

/** 저장 위치 화면의 멈춘 이유 한 줄. 잠깐의 실패는 적지 않는다. */
export function describeSyncStop(status: SyncStatus | null): string | null {
  switch (status?.stoppedReason) {
    case "update_required":
      return "앱을 업데이트해야 동기화가 다시 켜져요";
    case "server_behind":
      return "서버 업데이트를 기다리는 중이에요";
    case "unauthenticated":
      return "다시 로그인하면 동기화가 이어져요";
    default:
      return status?.hasQuarantine ? "일부 변경을 저장하지 못했어요" : null;
  }
}

/** "11월 28일 13시 5분" (기기 시간대). */
export function formatSyncTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${date.getHours()}시 ${date.getMinutes()}분`;
}
