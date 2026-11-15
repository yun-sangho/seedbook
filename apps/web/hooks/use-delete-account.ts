"use client";

import { useState } from "react";
import { authClient } from "@web/lib/auth-client";
import { type DeleteAccountResult, deleteAccount } from "@web/lib/delete-account";
import { getLocalEnvelopeStore } from "@web/lib/local-envelope-store";

/**
 * 회원 탈퇴 흐름 (모바일·데스크탑 공통). 성공하면 랜딩으로 이동하고, 세션이 오래돼
 * 거절되면 `outcome` 이 `reauth-required` 가 되어 화면이 재로그인을 안내한다.
 */
export function useDeleteAccount() {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<DeleteAccountResult | null>(null);

  const confirmDelete = async () => {
    setPending(true);
    setOutcome(null);
    const result = await deleteAccount(authClient, {
      // 앱 데이터베이스(네이티브 앱)와 이 origin 의 localStorage (모두 Seedbook 데이터) 를 비운다.
      clear: async () => {
        await getLocalEnvelopeStore().clear();
        window.localStorage.clear();
      },
    });
    if (result === "deleted") {
      window.location.href = "/";
      return;
    }
    setOutcome(result);
    setPending(false);
  };

  /** 새 세션을 받도록 로그아웃한다 — 다시 로그인한 뒤 바로 탈퇴할 수 있다. */
  const signOutToReauthenticate = async () => {
    await authClient.signOut();
    window.location.reload();
  };

  const reset = () => setOutcome(null);

  return { pending, outcome, confirmDelete, signOutToReauthenticate, reset };
}

export const DELETE_ACCOUNT_COPY = {
  title: "회원 탈퇴",
  description:
    "탈퇴하면 계좌·포트폴리오·리밸런싱 기록과 설정이 서버와 이 기기에서 모두 삭제되고 되돌릴 수 없어요.",
  confirmLabel: "탈퇴하기",
  reauthTitle: "다시 로그인이 필요해요",
  reauthDescription: "보안을 위해 로그인한 지 하루가 지나면 탈퇴 전에 다시 로그인해야 해요.",
  reauthLabel: "다시 로그인",
  failed: "탈퇴하지 못했어요. 잠시 후 다시 시도해주세요.",
} as const;
