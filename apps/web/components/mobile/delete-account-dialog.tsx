"use client";

import { DELETE_ACCOUNT_COPY, useDeleteAccount } from "@web/hooks/use-delete-account";
import type { DeleteAccountResult } from "@web/lib/delete-account";
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

function describeOutcome(outcome: DeleteAccountResult | null): string {
  if (outcome === "reauth-required") return DELETE_ACCOUNT_COPY.reauthDescription;
  if (outcome === "failed") return DELETE_ACCOUNT_COPY.failed;
  return DELETE_ACCOUNT_COPY.description;
}

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 모바일 회원 탈퇴 확인. 세션이 오래됐으면 같은 다이얼로그가 재로그인 안내로 바뀐다. */
export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { pending, outcome, confirmDelete, signOutToReauthenticate, reset } = useDeleteAccount();
  const needsReauth = outcome === "reauth-required";

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <AlertDialogRoot open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {needsReauth ? DELETE_ACCOUNT_COPY.reauthTitle : DELETE_ACCOUNT_COPY.title}
          </AlertDialogTitle>
          <AlertDialogDescription>{describeOutcome(outcome)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <div className="flex w-full gap-x2">
            <AlertDialogAction variant="neutralWeak" size="large" flexGrow disabled={pending}>
              취소
            </AlertDialogAction>
            {needsReauth ? (
              <ActionButton
                variant="neutralSolid"
                size="large"
                flexGrow
                onClick={signOutToReauthenticate}
              >
                {DELETE_ACCOUNT_COPY.reauthLabel}
              </ActionButton>
            ) : (
              <ActionButton
                variant="criticalSolid"
                size="large"
                flexGrow
                loading={pending}
                onClick={confirmDelete}
              >
                {DELETE_ACCOUNT_COPY.confirmLabel}
              </ActionButton>
            )}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  );
}
