"use client";

import { useEffect, useState } from "react";
import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@web/components/ui/dialog";
import {
  CLOUD_STORE_LABELS,
  downloadAllFromCloud,
  hasAnyLocalData,
  uploadAllToCloud,
  type MigrationProgress,
} from "@web/lib/storage-migration";
import {
  getStorageMode,
  pushStorageModeToServer,
  setStorageMode,
  type StorageMode,
} from "@web/lib/storage-mode";
import { Cloud, HardDrive, Loader2 } from "lucide-react";

type DialogState =
  | { kind: "closed" }
  | { kind: "confirm-to-cloud" }
  | { kind: "confirm-to-local" }
  | { kind: "progress"; direction: "to-cloud" | "to-local"; progress: MigrationProgress | null }
  | { kind: "error"; direction: "to-cloud" | "to-local"; message: string };

/**
 * 저장소 모드 선택 카드.
 *
 * - 현재 모드를 라디오로 표시.
 * - 브라우저 → 클라우드 전환 시 확인 다이얼로그 → 순차 업로드 → 리로드.
 * - 클라우드 → 브라우저 전환 시 확인 다이얼로그 → 순차 다운로드 → 리로드.
 *
 * 이 카드는 로그인된 사용자만 볼 수 있다 (AuthGate 가 앱 루트에서 세션을
 * 강제). 따라서 로그아웃 분기는 없다.
 */
export function StorageModeCard() {
  const [currentMode, setCurrentMode] = useState<StorageMode>("local");
  const [dialogState, setDialogState] = useState<DialogState>({ kind: "closed" });

  useEffect(() => {
    setCurrentMode(getStorageMode());
  }, []);

  async function runUpload() {
    setDialogState({ kind: "progress", direction: "to-cloud", progress: null });
    try {
      await uploadAllToCloud((p) =>
        setDialogState({ kind: "progress", direction: "to-cloud", progress: p })
      );
      setStorageMode("cloud");
      await pushStorageModeToServer("cloud");
      window.location.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      setDialogState({ kind: "error", direction: "to-cloud", message });
    }
  }

  async function runDownload() {
    setDialogState({ kind: "progress", direction: "to-local", progress: null });
    try {
      await downloadAllFromCloud((p) =>
        setDialogState({ kind: "progress", direction: "to-local", progress: p })
      );
      setStorageMode("local");
      await pushStorageModeToServer("local");
      window.location.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      setDialogState({ kind: "error", direction: "to-local", message });
    }
  }

  async function requestToCloud() {
    // 로컬 데이터가 아예 없으면 업로드 단계를 완전히 스킵.
    if (!hasAnyLocalData()) {
      setStorageMode("cloud");
      await pushStorageModeToServer("cloud");
      window.location.reload();
      return;
    }
    setDialogState({ kind: "confirm-to-cloud" });
  }

  function requestToLocal() {
    setDialogState({ kind: "confirm-to-local" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>저장소 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeOption
            icon={<HardDrive className="w-5 h-5" />}
            title="이 기기에만 저장"
            description="이 브라우저의 localStorage 에만 저장합니다. 다른 기기와 동기화되지 않습니다."
            selected={currentMode === "local"}
            disabled={currentMode === "local"}
            onSelect={requestToLocal}
          />
          <ModeOption
            icon={<Cloud className="w-5 h-5" />}
            title="클라우드에 저장"
            description="서버에 저장합니다. 같은 계정으로 어디서든 데이터를 볼 수 있습니다."
            selected={currentMode === "cloud"}
            disabled={currentMode === "cloud"}
            onSelect={requestToCloud}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          현재 선택:{" "}
          <span className="font-medium text-foreground">
            {currentMode === "cloud" ? "클라우드에 저장" : "이 기기에만 저장"}
          </span>
        </p>
      </CardContent>

      <ModeSwitchDialog
        dialogState={dialogState}
        onClose={() => setDialogState({ kind: "closed" })}
        onConfirmToCloud={runUpload}
        onConfirmToLocal={runDownload}
      />
    </Card>
  );
}

function ModeOption({
  icon,
  title,
  description,
  selected,
  disabled,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "text-left rounded-lg border p-4 transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border",
        disabled && !selected ? "opacity-60 cursor-not-allowed" : "hover:border-primary/60",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="font-semibold">{title}</span>
        {selected && <span className="ml-auto text-xs text-primary">선택됨</span>}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </button>
  );
}

function ModeSwitchDialog({
  dialogState,
  onClose,
  onConfirmToCloud,
  onConfirmToLocal,
}: {
  dialogState: DialogState;
  onClose: () => void;
  onConfirmToCloud: () => void;
  onConfirmToLocal: () => void;
}) {
  const open = dialogState.kind !== "closed";
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent showCloseButton={dialogState.kind !== "progress"}>
        {dialogState.kind === "confirm-to-cloud" && (
          <>
            <DialogHeader>
              <DialogTitle>클라우드 저장으로 전환</DialogTitle>
              <DialogDescription>
                현재 브라우저에 저장된 데이터를 클라우드로 업로드합니다. 클라우드에 기존 데이터가
                있으면 <strong>덮어씁니다</strong>. 계속하시겠습니까?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                취소
              </Button>
              <Button onClick={onConfirmToCloud}>클라우드로 전환</Button>
            </DialogFooter>
          </>
        )}

        {dialogState.kind === "confirm-to-local" && (
          <>
            <DialogHeader>
              <DialogTitle>브라우저 저장으로 전환</DialogTitle>
              <DialogDescription>
                클라우드 데이터를 이 브라우저로 복사합니다. 이 브라우저에 남아 있는 기존 데이터는{" "}
                <strong>덮어씁니다</strong>. 전환 전에 JSON 백업을 내보내는 것을 권장합니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                취소
              </Button>
              <Button onClick={onConfirmToLocal}>브라우저로 전환</Button>
            </DialogFooter>
          </>
        )}

        {dialogState.kind === "progress" && (
          <>
            <DialogHeader>
              <DialogTitle>
                {dialogState.direction === "to-cloud"
                  ? "클라우드로 업로드 중..."
                  : "브라우저로 다운로드 중..."}
              </DialogTitle>
              <DialogDescription>
                {renderProgressText(dialogState.progress, dialogState.direction)}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {dialogState.kind === "error" && (
          <>
            <DialogHeader>
              <DialogTitle>전환 실패</DialogTitle>
              <DialogDescription>{dialogState.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                닫기
              </Button>
              <Button
                onClick={() =>
                  dialogState.direction === "to-cloud" ? onConfirmToCloud() : onConfirmToLocal()
                }
              >
                재시도
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function renderProgressText(
  progress: MigrationProgress | null,
  direction: "to-cloud" | "to-local"
): string {
  if (!progress) {
    return direction === "to-cloud"
      ? "업로드를 준비하고 있습니다..."
      : "다운로드를 준비하고 있습니다...";
  }
  const verb = direction === "to-cloud" ? "업로드 중" : "다운로드 중";
  return `${CLOUD_STORE_LABELS[progress.key]} ${verb} (${progress.index + 1}/${progress.total})`;
}
