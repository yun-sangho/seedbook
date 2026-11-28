"use client";

import { useEffect, useState } from "react";
import { reloadApp } from "@mobile/lib/device-storage";
import {
  downloadAllFromCloud,
  hasAnyLocalData,
  type MigrationProgress,
  uploadAllToCloud,
} from "@mobile/lib/storage-migration";
import {
  getStorageMode,
  pushStorageModeToServer,
  type StorageMode,
  saveStorageMode,
} from "@mobile/lib/storage-mode";

export type SwitchDirection = "to-cloud" | "to-local";

export type StorageModeSwitchState =
  | { kind: "idle" }
  | { kind: "confirm"; direction: SwitchDirection }
  | { kind: "progress"; direction: SwitchDirection; progress: MigrationProgress | null }
  | { kind: "error"; direction: SwitchDirection; message: string };

/**
 * 저장소 모드 전환 (이 기기 ↔ 클라우드). 전환은 덮어쓰지 않고 양쪽 데이터를 합친 뒤
 * 모드를 바꾸고 다시 불러온다 (`lib/storage-migration.ts`).
 *
 * - 클라우드로: 이 기기에 데이터가 없으면 확인 없이 바로 바꾼다.
 * - 실패하면 `error` 상태로 남아 같은 방향으로 다시 시도할 수 있다.
 */
export function useStorageModeSwitch() {
  const [mode, setMode] = useState<StorageMode>("local");
  const [state, setState] = useState<StorageModeSwitchState>({ kind: "idle" });

  useEffect(() => {
    setMode(getStorageMode());
  }, []);

  async function finish(next: StorageMode) {
    if (!(await saveStorageMode(next))) throw new Error("이 기기에 저장하지 못했어요");
    await pushStorageModeToServer(next);
    await reloadApp();
  }

  async function run(direction: SwitchDirection) {
    setState({ kind: "progress", direction, progress: null });
    const onProgress = (progress: MigrationProgress) =>
      setState({ kind: "progress", direction, progress });
    try {
      if (direction === "to-cloud") {
        await uploadAllToCloud(onProgress);
        await finish("cloud");
      } else {
        await downloadAllFromCloud(onProgress);
        await finish("local");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      setState({ kind: "error", direction, message });
    }
  }

  async function request(next: StorageMode) {
    if (next === mode) return;
    if (next === "cloud" && !(await hasAnyLocalData())) {
      await run("to-cloud");
      return;
    }
    setState({ kind: "confirm", direction: next === "cloud" ? "to-cloud" : "to-local" });
  }

  return {
    mode,
    state,
    request,
    run,
    cancel: () => setState({ kind: "idle" }),
  };
}

export function describeSwitchProgress(
  progress: MigrationProgress | null,
  direction: SwitchDirection
): string {
  if (!progress) {
    return direction === "to-cloud"
      ? "올릴 데이터를 준비하고 있어요"
      : "받을 데이터를 준비하고 있어요";
  }
  if (progress.step === "history") return "계좌 금액 기록을 맞추고 있어요";
  return direction === "to-cloud" ? "자산 데이터를 올리는 중 (1/2)" : "자산 데이터를 받는 중 (1/2)";
}
