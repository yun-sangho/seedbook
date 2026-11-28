"use client";

import { useEffect } from "react";
import { useSyncStatusStore } from "@web/features/settings/stores/sync-status-store";
import { useSession } from "@web/lib/auth-client";
import { getStorageMode } from "@web/lib/storage-mode";
import {
  getRecordLayer,
  getSyncEngine,
  initialCloudSync,
  onSyncStatus,
} from "@web/lib/sync/record-sync";
import { rehydrateRecordStores } from "@web/lib/sync/record-sync-stores";

/**
 * cloud 모드에서 동기화 v2 엔진을 돌린다 (`lib/sync/v2/engine.ts`).
 *
 * - 로컬 변경이 outbox 에 기록되면 잠시 모아 보낸다.
 * - 앱으로 돌아올 때(다시 보일 때)·온라인이 될 때 기다리던 재시도를 버리고 바로 동기화한다.
 * - 숨겨질 때 남은 변경을 보낸다.
 * - 동기화가 레코드를 바꾸면 그 store 를 다시 읽는다.
 *
 * local 모드면 아무것도 하지 않는다.
 */
export function RecordSyncRunner() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId || getStorageMode() !== "cloud") return;
    const engine = getSyncEngine();
    const layer = getRecordLayer();
    const setStatus = useSyncStatusStore.getState().setSyncStatus;
    const offs = [
      onSyncStatus(setStatus),
      layer.onLocalChange(() => engine.notifyLocalChange()),
      layer.onRemoteChange(rehydrateRecordStores),
    ];
    const onVisibility = () => {
      if (document.visibilityState === "visible") void engine.resume();
      else void engine.push();
    };
    const onOnline = () => void engine.online();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    let stopped = false;
    void initialCloudSync().then(() => {
      if (!stopped) void engine.start();
    });

    return () => {
      stopped = true;
      engine.stop();
      for (const off of offs) off();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [userId]);

  return null;
}
