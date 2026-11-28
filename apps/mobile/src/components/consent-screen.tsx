"use client";

import { useState } from "react";
import { sessionStorageOrNull } from "@mobile/components/biometric-sign-in-button";
import { LegalDocumentViewer } from "@mobile/components/legal-document-viewer";
import { DeleteAccountDialog } from "@mobile/components/mobile/delete-account-dialog";
import { authClient } from "@mobile/lib/auth-client";
import { declineConsent, submitConsent } from "@mobile/lib/consent-client";
import { reloadApp } from "@mobile/lib/device-storage";
import type { ConsentDocument } from "@mobile/lib/legal/catalog";
import { koreanDate, type LegalDocumentId } from "@mobile/lib/legal-documents";
import { markSignedOut } from "@mobile/lib/native/biometric-login";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import {
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogRoot,
  AlertDialogTitle,
} from "@mobile/seed-design/ui/alert-dialog";
import { Callout } from "@mobile/seed-design/ui/callout";
import { Checkbox } from "@mobile/seed-design/ui/checkbox";

const DECLINE_DESCRIPTION = {
  newSignUp: "가입을 멈추고 방금 만든 계정을 지워요. 이 기기에 있던 자산은 지우지 않아요.",
  existing: "동의하기 전에는 서비스를 쓸 수 없어 로그아웃해요. 계정과 자산은 지우지 않아요.",
};

/**
 * 약관·개인정보 동의 화면. 첫 가입, 기존 사용자, 약관 개정 때 모두 이 화면을 쓴다. 개정이면 바뀐
 * 문서마다 시행일과 바뀐 내용 요약을 보여 준다.
 */
export function ConsentScreen({
  newSignUp,
  documents,
}: {
  newSignUp: boolean;
  documents: readonly ConsentDocument[];
}) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<"agree" | "decline" | null>(null);
  const [failed, setFailed] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // 사이트 페이지로 나가지 않고 이 화면 위에서 문서를 본다 (닫으면 체크 상태·스크롤이 그대로다).
  const [viewing, setViewing] = useState<LegalDocumentId | null>(null);

  const allChecked = documents.every(({ document }) => checked.has(document));
  const revised = documents.some(({ change }) => change !== null);

  const toggle = (id: string, next: boolean) => {
    const updated = new Set(checked);
    if (next) updated.add(id);
    else updated.delete(id);
    setChecked(updated);
  };

  const agree = async () => {
    setPending("agree");
    setFailed(false);
    if ((await submitConsent(documents)) === "failed") {
      setPending(null);
      setFailed(true);
      return;
    }
    // 동의 전에는 서버가 데이터를 주지 않았으므로 처음부터 다시 불러온다 (개정됐으면 다시 묻는다).
    await reloadApp();
  };

  const decline = async () => {
    setPending("decline");
    setFailed(false);
    if (!(await declineConsent())) {
      setPending(null);
      setDeclineOpen(false);
      setFailed(true);
      return;
    }
    const storage = sessionStorageOrNull();
    if (storage) markSignedOut(storage);
    await authClient.signOut().catch(() => {});
    await reloadApp();
  };

  return (
    <main className="bg-bg-layer-default text-fg-neutral flex h-dvh w-full flex-col overflow-y-auto px-x6 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-x8 pt-x16">
        <div className="flex flex-col gap-x2">
          <h1 className="t8-bold">{revised ? "약관이 바뀌었어요" : "약관에 동의해 주세요"}</h1>
          <p className="t5-regular text-fg-neutral-muted break-keep">
            {revised
              ? "바뀐 내용을 확인하고 동의해야 Seedbook 을 계속 이용할 수 있어요."
              : "Seedbook 을 이용하려면 아래 내용에 동의해야 해요."}
          </p>
        </div>

        <div className="flex flex-col gap-x4">
          <Checkbox
            label="전체 동의"
            size="large"
            weight="bold"
            tone="neutral"
            checked={allChecked}
            onCheckedChange={(next) =>
              setChecked(next ? new Set(documents.map(({ document }) => document)) : new Set())
            }
          />
          <div className="border-stroke-neutral-subtle border-t" />
          {documents.map(({ document, title, change }) => (
            <div key={document} className="flex flex-col gap-x1">
              <div className="flex items-center justify-between gap-x2">
                <Checkbox
                  label={`${title} 동의 (필수)`}
                  size="large"
                  tone="neutral"
                  checked={checked.has(document)}
                  onCheckedChange={(next) => toggle(document, next)}
                />
                <button
                  type="button"
                  aria-label={`${title} 보기`}
                  onClick={() => setViewing(document)}
                  className="t4-regular text-fg-neutral-subtle shrink-0 underline underline-offset-4"
                >
                  보기
                </button>
              </div>
              {change && (
                <p className="t4-regular text-fg-neutral-muted break-keep pl-x8">
                  {[`${koreanDate(change.effectiveDate)}부터`, change.summary]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-x2">
          {failed && (
            <div role="alert" className="pb-x2">
              <Callout
                tone="neutral"
                description="처리하지 못했어요. 잠시 뒤 다시 시도해 주세요."
              />
            </div>
          )}
          <ActionButton
            variant="neutralSolid"
            size="large"
            disabled={!allChecked || pending === "decline"}
            loading={pending === "agree"}
            onClick={agree}
          >
            동의하고 계속하기
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="large"
            disabled={pending !== null}
            onClick={() => setDeclineOpen(true)}
          >
            동의하지 않기
          </ActionButton>
          {!newSignUp && (
            <ActionButton
              variant="ghost"
              size="small"
              color="fg.neutralMuted"
              disabled={pending !== null}
              onClick={() => setDeleteOpen(true)}
            >
              회원 탈퇴
            </ActionButton>
          )}
        </div>
      </div>

      <AlertDialogRoot
        open={declineOpen}
        onOpenChange={(open) => {
          if (pending === null) setDeclineOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>동의하지 않을까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {newSignUp ? DECLINE_DESCRIPTION.newSignUp : DECLINE_DESCRIPTION.existing}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <div className="flex w-full gap-x2">
              <AlertDialogAction
                variant="neutralWeak"
                size="large"
                flexGrow
                disabled={pending !== null}
              >
                취소
              </AlertDialogAction>
              <ActionButton
                variant="criticalSolid"
                size="large"
                flexGrow
                loading={pending === "decline"}
                onClick={decline}
              >
                {newSignUp ? "가입 취소" : "나가기"}
              </ActionButton>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogRoot>
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
      {viewing && <LegalDocumentViewer document={viewing} onClose={() => setViewing(null)} />}
    </main>
  );
}
