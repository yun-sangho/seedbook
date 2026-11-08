"use client";

import { useEffect } from "react";
import { useSession } from "@web/lib/auth-client";
import { getStorageMode } from "@web/lib/storage-mode";
import { startEntitySync } from "@web/lib/sync/entity-sync-engine";
import { SYNCED_STORES } from "@web/lib/sync/synced-stores";

/**
 * cloud 모드에서 엔티티 동기화로 옮긴 store 들(`SYNCED_STORES`)의 동기화를 돌린다.
 *
 * 하이드레이션은 hybrid-storage 가 서버 전체 pull 로 이미 마쳤으므로, 여기서는 이후의
 * 로컬 변경 전송과 포커스/재표시 때의 증분 pull 을 맡는다. local 모드면 아무것도 하지
 * 않는다.
 */
export function EntitySyncRunner() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId || getStorageMode() !== "cloud") return;
    const handles = SYNCED_STORES.map(({ config, binding }) =>
      startEntitySync(config, binding, { userId })
    );
    for (const handle of handles) void handle.pull().then(() => handle.flush());
    return () => handles.forEach((handle) => handle.stop());
  }, [userId]);

  return null;
}
