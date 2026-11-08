"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@web/lib/auth-client";
import { downloadAllFromCloud, uploadAllToCloud } from "@web/lib/storage-migration";
import { getStorageMode, setStorageMode, type StorageMode } from "@web/lib/storage-mode";

/**
 * 로그인된 사용자의 user_preference.storageMode 를 localStorage 와 동기화한다.
 *
 * 시나리오:
 *   - 다른 기기에서 cloud 로 전환했고, 새 기기에서 처음 로그인 → 서버는 cloud,
 *     로컬은 기본 local. sync 가 localStorage 를 cloud 로 바꾸고 reload 해서
 *     클라우드 데이터로 자동 재하이드레이션.
 *   - 같은 기기에서 다시 로그인 → 서버 == 로컬, 아무 일도 안 함.
 *   - 서버에 행이 없음 → 서버 응답 "local" 이 default. 로컬도 local 이면 무동작.
 *
 * 인증 없으면 (=로그아웃 상태) fetch 자체를 시도하지 않는다. 세션이 바뀔 때마다
 * (로그인/로그아웃/계정 전환) 한 번씩만 동기화 — 동일 userId 재진입은 ref 로 차단.
 */
export function StorageModeSync() {
  const { data: session, isPending } = useSession();
  // 같은 userId 에 대해 sync 가 두 번 돌지 않도록 마지막으로 동기화한 userId 를 기억.
  const syncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPending) return;
    const userId = session?.user?.id ?? null;
    if (!userId) {
      syncedUserIdRef.current = null;
      return;
    }
    if (syncedUserIdRef.current === userId) return;
    syncedUserIdRef.current = userId;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/storage-mode", { credentials: "include" });
        if (!res.ok) return;
        const body = (await res.json()) as { storageMode?: unknown };
        const serverMode = body.storageMode === "cloud" ? "cloud" : "local";
        if (cancelled) return;

        const localMode = getStorageMode();
        if (serverMode !== localMode) {
          // 서버가 진실의 원천 — 다른 기기에서 바꾼 모드를 따른다. 단, 모드만 바꾸면 이
          // 기기 데이터가 가려지거나 덮일 수 있으므로 설정 화면의 전환과 똑같이 먼저
          // 양쪽을 합친다. 합치기에 실패하면 모드를 바꾸지 않고 다음 로드에 다시 시도.
          if (serverMode === "cloud") await uploadAllToCloud();
          else await downloadAllFromCloud();
          if (cancelled) return;
          setStorageMode(serverMode satisfies StorageMode);
          window.location.reload();
        }
      } catch {
        // 네트워크 오류 / 합치기 실패는 무시 — 모드는 그대로 두고 다음 마운트에서 다시 시도.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPending, session?.user?.id]);

  return null;
}
