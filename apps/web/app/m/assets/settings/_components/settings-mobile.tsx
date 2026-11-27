"use client";

import { useRef, useState } from "react";
import {
  IconCheckmarkLine,
  IconDocumentArrowLeftLine,
  IconDocumentPlusLine,
  IconKeyholeShieldLine,
  IconSparkle2Line,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import {
  describeSwitchProgress,
  type SwitchDirection,
  useStorageModeSwitch,
} from "@web/features/settings/hooks/use-storage-mode-switch";
import { backupAccountTag, resolveBackupIds } from "@web/features/settings/utils/backup-ids";
import {
  type BackupSections,
  backupFileName,
  buildBackup,
  parseBackup,
} from "@web/features/settings/utils/data-backup";
import { assignDemoDataIds } from "@web/features/settings/utils/demo-data";
import { restoreBackupSections } from "@web/features/settings/utils/restore-backup";
import { getActiveAccount } from "@web/lib/account-storage";
import { flushDeviceStorage } from "@web/lib/device-storage";
import { fetchCloudItemIds } from "@web/lib/storage-migration";
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
import { List, ListButtonItem } from "@web/seed-design/ui/list";
import { ListHeader } from "@web/seed-design/ui/list-header";
import { ProgressCircle } from "@web/seed-design/ui/progress-circle";

const DEMO_DATA_URL = "/seed-data/user-data.json";

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

/** 데이터 가져오기·데모 데이터의 확인과 결과 안내. */
type DataDialog =
  | { kind: "closed" }
  | {
      kind: "confirm-restore";
      source: "file" | "demo";
      data: Partial<BackupSections>;
      newIds?: ReadonlyMap<string, string>;
    }
  | { kind: "message"; title: string; description: string; reloadOnClose?: boolean };

/** 더보기 → 설정. 저장소 모드 전환과 데이터 백업 (예전 PC 관리 화면). */
export function SettingsMobile() {
  const { push } = useFlow();
  const storage = useStorageModeSwitch();
  const [dataDialog, setDataDialog] = useState<DataDialog>({ kind: "closed" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const investments = useInvestmentStore((s) => s.investments);
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const rebalancingSessions = useRebalancingStore((s) => s.sessions);

  const showError = (description: string) =>
    setDataDialog({ kind: "message", title: "불러오지 못했어요", description });

  const askFileRestore = async (raw: unknown) => {
    const parsed = parseBackup(raw);
    if (!parsed.ok) {
      showError("Seedbook 에서 내보낸 데이터 파일이 아니에요.");
      return;
    }
    try {
      const userId = getActiveAccount();
      if (!userId) throw new Error("no active account");
      const { data, newIds } = await resolveBackupIds(parsed, userId, {
        fetchOwnIds: fetchCloudItemIds,
      });
      setDataDialog({ kind: "confirm-restore", source: "file", data, newIds });
    } catch (error) {
      console.error(error);
      showError("파일을 확인하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    }
  };

  const exportData = async () => {
    const userId = getActiveAccount();
    if (!userId) return;
    const backup = buildBackup(
      { investments, portfolios, rebalancingSessions },
      await backupAccountTag(userId)
    );
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 같은 파일을 다시 골라도 change 가 오도록 비운다.
    event.target.value = "";
    if (!file) return;
    file
      .text()
      .then((text) => askFileRestore(JSON.parse(text)))
      .catch((error: unknown) => {
        console.error(error);
        showError("파일을 읽지 못했어요. 내보낸 JSON 파일인지 확인해 주세요.");
      });
  };

  const loadDemoData = async () => {
    try {
      const res = await fetch(DEMO_DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseBackup(await res.json());
      if (!parsed.ok) throw new Error("invalid demo data file");
      const userId = getActiveAccount();
      if (!userId) throw new Error("no active account");
      const data = await assignDemoDataIds(parsed.data, userId);
      setDataDialog({ kind: "confirm-restore", source: "demo", data });
    } catch (error) {
      console.error(error);
      showError("데모 데이터를 받지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    }
  };

  const confirmRestore = (data: Partial<BackupSections>, newIds?: ReadonlyMap<string, string>) => {
    restoreBackupSections(data, newIds);
    setDataDialog({
      kind: "message",
      title: "데이터를 불러왔어요",
      description: "확인을 누르면 화면을 새로 불러와요.",
      reloadOnClose: true,
    });
  };

  const closeDataDialog = async () => {
    if (dataDialog.kind === "message" && dataDialog.reloadOnClose) {
      if (!(await flushDeviceStorage())) {
        showError("이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.");
        return;
      }
      window.location.reload();
      return;
    }
    setDataDialog({ kind: "closed" });
  };

  const switching = storage.state.kind === "progress";

  return (
    <div className="pb-x6">
      <ListHeader>계정</ListHeader>
      <List>
        <ListButtonItem
          prefix={<Icon svg={<IconKeyholeShieldLine />} />}
          title="로그인 수단"
          detail="다른 로그인 수단을 연결해 같은 계정으로 로그인해요"
          onClick={() => push("LoginMethods", {})}
        />
      </List>

      <ListHeader className="mt-x4">저장 위치</ListHeader>
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

      <ListHeader className="mt-x4">데이터</ListHeader>
      <List>
        <ListButtonItem
          prefix={<Icon svg={<IconDocumentArrowLeftLine />} />}
          title="데이터 내보내기"
          detail={`계좌 ${investments.length} · 포트폴리오 ${portfolios.length} · 리밸런싱 ${rebalancingSessions.length}개를 JSON 파일로 저장해요`}
          onClick={exportData}
        />
        <ListButtonItem
          prefix={<Icon svg={<IconDocumentPlusLine />} />}
          title="데이터 가져오기"
          detail="내보낸 JSON 파일의 항목으로 지금 데이터를 바꿔요"
          onClick={() => fileInputRef.current?.click()}
        />
        <ListButtonItem
          prefix={<Icon svg={<IconSparkle2Line />} />}
          title="데모 데이터 불러오기"
          detail="샘플 계좌·포트폴리오로 둘러볼 수 있어요"
          onClick={loadDemoData}
        />
      </List>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={importFile}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      <StorageSwitchDialog state={storage.state} onCancel={storage.cancel} onRun={storage.run} />

      <AlertDialogRoot
        open={dataDialog.kind !== "closed"}
        onOpenChange={(open) => {
          if (!open) closeDataDialog();
        }}
      >
        <AlertDialogContent>
          {dataDialog.kind === "confirm-restore" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {dataDialog.source === "demo"
                    ? "데모 데이터를 불러올까요?"
                    : "데이터를 가져올까요?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  파일에 담긴 항목은 지금 데이터를 덮어써요. 필요하면 먼저 내보내기로 백업해 두세요.
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
                    onClick={() => confirmRestore(dataDialog.data, dataDialog.newIds)}
                  >
                    덮어쓰기
                  </ActionButton>
                </div>
              </AlertDialogFooter>
            </>
          )}
          {dataDialog.kind === "message" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{dataDialog.title}</AlertDialogTitle>
                <AlertDialogDescription>{dataDialog.description}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <ActionButton
                  variant="neutralSolid"
                  size="large"
                  flexGrow
                  onClick={closeDataDialog}
                >
                  확인
                </ActionButton>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialogRoot>
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
