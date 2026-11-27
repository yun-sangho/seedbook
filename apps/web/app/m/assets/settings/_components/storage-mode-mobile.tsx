"use client";

import { IconCheckmarkLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import {
  describeSwitchProgress,
  type SwitchDirection,
  useStorageModeSwitch,
} from "@web/features/settings/hooks/use-storage-mode-switch";
import { separateStorageNotice } from "@web/features/settings/utils/storage-notice";
import { usePwaInstallState } from "@web/hooks/use-pwa-install";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogRoot,
  AlertDialogTitle,
} from "@web/seed-design/ui/alert-dialog";
import { Callout } from "@web/seed-design/ui/callout";
import { List, ListButtonItem } from "@web/seed-design/ui/list";
import { ProgressCircle } from "@web/seed-design/ui/progress-circle";

const SWITCH_COPY: Record<
  SwitchDirection,
  { title: string; description: string; confirm: string }
> = {
  "to-cloud": {
    title: "클라우드 저장으로 바꿀까요?",
    description:
      "이 기기의 데이터를 클라우드에 올려요. 클라우드에 있던 데이터와 합쳐지고 지워지는 항목은 없어요. 같은 항목은 이 기기의 내용으로 맞춰요.",
    confirm: "클라우드로 바꾸기",
  },
  "to-local": {
    title: "이 기기에만 저장할까요?",
    description:
      "클라우드 데이터를 이 기기로 받아요. 이 기기의 데이터와 합쳐지고 지워지는 항목은 없어요. 같은 항목은 이 기기의 내용을 유지해요.",
    confirm: "이 기기로 바꾸기",
  },
};

/**
 * 설정 → 저장 위치. 이 기기 / 클라우드를 고르면 확인 뒤 양쪽 데이터를 합치고 새로 불러온다.
 * 이 기기에만 저장 중이면 Safari·홈 화면 앱(또는 앱·브라우저)의 데이터가 따로라는 것도 알린다.
 */
export function StorageModeMobile() {
  const storage = useStorageModeSwitch();
  const { isIOS, isNativeApp } = usePwaInstallState();
  const notice = separateStorageNotice({ isIOS, isNativeApp, storageMode: storage.mode });
  const switching = storage.state.kind === "progress";

  return (
    <div className="pb-x6">
      {notice && (
        <div className="px-x4 pt-x4">
          <Callout
            tone="informative"
            description={`${notice}. 클라우드에 저장하면 어디서든 같은 데이터를 볼 수 있어요.`}
          />
        </div>
      )}
      <List>
        <ListButtonItem
          title="이 기기에만 저장"
          detail="이 기기에만 두고 다른 기기와 맞추지 않아요"
          suffix={storage.mode === "local" ? <Icon svg={<IconCheckmarkLine />} /> : undefined}
          aria-pressed={storage.mode === "local"}
          disabled={switching}
          onClick={() => storage.request("local")}
        />
        <ListButtonItem
          title="클라우드에 저장"
          detail="같은 계정이면 어느 기기에서든 같은 데이터를 봐요"
          suffix={storage.mode === "cloud" ? <Icon svg={<IconCheckmarkLine />} /> : undefined}
          aria-pressed={storage.mode === "cloud"}
          disabled={switching}
          onClick={() => storage.request("cloud")}
        />
      </List>
      <StorageSwitchDialog state={storage.state} onCancel={storage.cancel} onRun={storage.run} />
    </div>
  );
}

function StorageSwitchDialog({
  state,
  onCancel,
  onRun,
}: {
  state: ReturnType<typeof useStorageModeSwitch>["state"];
  onCancel: () => void;
  onRun: (direction: SwitchDirection) => void;
}) {
  const busy = state.kind === "progress";

  return (
    <AlertDialogRoot
      open={state.kind !== "idle"}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogContent>
        {state.kind === "confirm" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{SWITCH_COPY[state.direction].title}</AlertDialogTitle>
              <AlertDialogDescription>
                {SWITCH_COPY[state.direction].description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <div className="flex w-full gap-x2">
                <AlertDialogAction variant="neutralWeak" size="large" flexGrow>
                  취소
                </AlertDialogAction>
                <ActionButton
                  variant="neutralSolid"
                  size="large"
                  flexGrow
                  onClick={() => onRun(state.direction)}
                >
                  {SWITCH_COPY[state.direction].confirm}
                </ActionButton>
              </div>
            </AlertDialogFooter>
          </>
        )}
        {state.kind === "progress" && (
          <AlertDialogHeader>
            <AlertDialogTitle>
              {state.direction === "to-cloud" ? "클라우드로 옮기는 중" : "이 기기로 옮기는 중"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="flex items-center gap-x2">
                <ProgressCircle size="24" tone="neutral" />
                {describeSwitchProgress(state.progress, state.direction)}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
        )}
        {state.kind === "error" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>저장 위치를 바꾸지 못했어요</AlertDialogTitle>
              <AlertDialogDescription>{state.message}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <div className="flex w-full gap-x2">
                <AlertDialogAction variant="neutralWeak" size="large" flexGrow>
                  닫기
                </AlertDialogAction>
                <ActionButton
                  variant="neutralSolid"
                  size="large"
                  flexGrow
                  onClick={() => onRun(state.direction)}
                >
                  다시 시도
                </ActionButton>
              </div>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialogRoot>
  );
}
