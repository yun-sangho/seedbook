"use client";

import { Button } from "@web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@web/components/ui/dialog";
import { DELETE_ACCOUNT_COPY, useDeleteAccount } from "@web/hooks/use-delete-account";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 데스크탑 회원 탈퇴 확인. 세션이 오래됐으면 재로그인 안내로 바뀐다. */
export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { pending, outcome, confirmDelete, signOutToReauthenticate, reset } = useDeleteAccount();
  const needsReauth = outcome === "reauth-required";

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {needsReauth ? DELETE_ACCOUNT_COPY.reauthTitle : DELETE_ACCOUNT_COPY.title}
          </DialogTitle>
          <DialogDescription>
            {needsReauth ? DELETE_ACCOUNT_COPY.reauthDescription : DELETE_ACCOUNT_COPY.description}
          </DialogDescription>
        </DialogHeader>
        {outcome === "failed" && (
          <p role="alert" className="text-sm text-destructive">
            {DELETE_ACCOUNT_COPY.failed}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => handleOpenChange(false)}>
            취소
          </Button>
          {needsReauth ? (
            <Button onClick={signOutToReauthenticate}>{DELETE_ACCOUNT_COPY.reauthLabel}</Button>
          ) : (
            <Button variant="destructive" disabled={pending} onClick={confirmDelete}>
              {pending ? "탈퇴하는 중…" : DELETE_ACCOUNT_COPY.confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
