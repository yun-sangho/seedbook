"use client";

import { useRef, useState } from "react";
import {
  IconDocumentArrowLeftLine,
  IconDocumentPlusLine,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import { backupAccountTag, resolveBackupIds } from "@web/features/settings/utils/backup-ids";
import {
  type BackupSections,
  backupFileName,
  buildBackup,
  parseBackup,
} from "@web/features/settings/utils/data-backup";
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

/** 데이터 가져오기의 확인과 결과 안내. */
type DataDialog =
  | { kind: "closed" }
  | {
      kind: "confirm-restore";
      data: Partial<BackupSections>;
      newIds?: ReadonlyMap<string, string>;
    }
  | { kind: "message"; title: string; description: string; reloadOnClose?: boolean };

/** 설정 → 백업. 내보내기·가져오기. */
export function DataBackupMobile() {
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
      setDataDialog({ kind: "confirm-restore", data, newIds });
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

  return (
    <div className="pt-x2 pb-x6">
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
                <AlertDialogTitle>데이터를 가져올까요?</AlertDialogTitle>
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
