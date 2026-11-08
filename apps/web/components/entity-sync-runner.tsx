"use client";

import { useEffect } from "react";
import { debtsSyncBinding } from "@web/features/debts/sync/debts-sync-binding";
import { debtsSyncConfig } from "@web/features/debts/sync/debts-sync-config";
import { getCurrentViewContext } from "@web/features/sharing/stores/view-context-store";
import { useSession } from "@web/lib/auth-client";
import { getStorageMode } from "@web/lib/storage-mode";
import { startEntitySync } from "@web/lib/sync/entity-sync-engine";

/**
 * cloud 모드에서 엔티티 동기화로 옮긴 store 들의 동기화를 돌린다 (지금은 부채).
 *
 * 하이드레이션은 hybrid-storage 가 서버 전체 pull 로 이미 마쳤으므로, 여기서는 이후의
 * 로컬 변경 전송과 포커스/재표시 때의 증분 pull 을 맡는다. 공유 열람 중이거나 local
 * 모드면 아무것도 하지 않는다.
 */
export function EntitySyncRunner() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId || getStorageMode() !== "cloud" || getCurrentViewContext()) return;
    const handle = startEntitySync(debtsSyncConfig, debtsSyncBinding, { userId });
    void handle.pull().then(() => handle.flush());
    return () => handle.stop();
  }, [userId]);

  return null;
}
