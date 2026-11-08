"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@web/lib/auth-client";
import { fetchPreferences } from "@web/lib/preferences";
import { usePreferencesStore } from "@web/lib/preferences-store";

/**
 * 로그인하면 계정에 저장된 개인 설정을 받아 이 기기에 반영한다 (계정 값이 우선).
 * 세션이 바뀔 때(로그인/계정 전환)마다 한 번만 — 같은 userId 재진입은 ref 로 막는다.
 */
export function PreferencesSync() {
  const { data: session, isPending } = useSession();
  const syncedUserIdRef = useRef<string | null>(null);
  const setRebalancingTaskSort = usePreferencesStore((s) => s.setRebalancingTaskSort);

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
    let applied = false;
    let unsubscribe: (() => void) | undefined;
    void fetchPreferences().then((prefs) => {
      if (cancelled || !prefs) return;
      // 스토어가 이 기기의 캐시로 복원되기 전에 넣으면 복원이 덮어쓴다 — 복원이 끝난 뒤에 넣는다.
      const apply = () => {
        applied = true;
        setRebalancingTaskSort(prefs.rebalancingTaskSort);
      };
      if (usePreferencesStore.persist.hasHydrated()) apply();
      else unsubscribe = usePreferencesStore.persist.onFinishHydration(apply);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
      // 반영하기 전에 정리되면 (개발 모드 StrictMode 의 두 번 실행 등) 다음 실행이 다시 받아오게 한다.
      if (!applied) syncedUserIdRef.current = null;
    };
  }, [isPending, session?.user?.id, setRebalancingTaskSort]);

  return null;
}
