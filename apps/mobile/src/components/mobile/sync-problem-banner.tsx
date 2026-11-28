"use client";

import { useEffect, useState } from "react";
import { IconExclamationmarkCircleLine } from "@karrotmarket/react-monochrome-icon";
import { useSyncStatusStore } from "@mobile/features/settings/stores/sync-status-store";
import { SYNC_PROBLEM_TITLES, syncProblem } from "@mobile/features/settings/utils/sync-problem";
import { getStorageMode, type StorageMode } from "@mobile/lib/storage-mode";
import { PageBanner, PrefixIcon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";

/**
 * 홈의 동기화 문제 표시 (설계 §5.8). 마지막 성공이 3일 넘음 / 앱 업데이트 필요(426) / 격리 발생일 때만
 * 보이고, 누르면 설정 → 저장 위치로 간다.
 */
export function SyncProblemBanner() {
  const status = useSyncStatusStore((s) => s.sync);
  const [mode, setMode] = useState<StorageMode>("local");
  useEffect(() => setMode(getStorageMode()), []);
  const { push } = useFlow();

  const problem = syncProblem(status, mode, new Date());
  if (!problem) return null;

  return (
    <button
      type="button"
      className="bg-bg-layer-default sticky top-0 z-[1] block w-full text-left"
      onClick={() => push("StorageMode", {})}
    >
      <PageBanner.Root variant="weak" tone="warning" role="status" aria-live="polite">
        <PrefixIcon svg={<IconExclamationmarkCircleLine />} />
        <PageBanner.Content>
          <PageBanner.Body>
            <PageBanner.Title>{SYNC_PROBLEM_TITLES[problem]}</PageBanner.Title>
            <PageBanner.Description>저장 위치에서 확인해 주세요</PageBanner.Description>
          </PageBanner.Body>
        </PageBanner.Content>
      </PageBanner.Root>
    </button>
  );
}
