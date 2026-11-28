"use client";

import { useState } from "react";
import { accountStorage, getActiveAccount } from "@mobile/lib/account-storage";
import { authClient } from "@mobile/lib/auth-client";
import { type DeleteAccountResult, deleteAccount } from "@mobile/lib/delete-account";
import { reloadApp } from "@mobile/lib/device-storage";
import { isBiometricLoginEnrolledFor } from "@mobile/lib/native/biometric-login";
import { getBiometricLoginDeps } from "@mobile/lib/native/biometric-login-client";
import { stopNotificationsOnSignOut } from "@mobile/lib/native/notifications";
import { signOutAndReload } from "@mobile/lib/sign-out";

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
    // 다른 탭에서 계정을 바꿨으면 쿠키는 새 계정이다 — 엉뚱한 계정을 지우지 않는다.
    const current = await authClient.getSession().catch(() => null);
    if (current?.data?.user && current.data.user.id !== getActiveAccount()) {
      await reloadApp();
      return;
    }
    // 이 계정으로 켠 생체 인증 로그인 토큰은 금고(Keychain/Keystore)에 남는다 — 기기 데이터를 비우면
    // 누구 것인지 알 수 없으므로 먼저 확인해 두고, 탈퇴하면 지운다 (남기면 로그인 화면이 없는 계정으로
    // 생체 인증을 묻는다).
    const biometric = await getBiometricLoginDeps().catch(() => null);
    const me = getActiveAccount();
    const ownsBiometricLogin =
      biometric !== null &&
      typeof me === "string" &&
      isBiometricLoginEnrolledFor(biometric.storage, me);
    // 이 계정의 기기 데이터 (브라우저 localStorage, 앱 SQLite) 를 비운다.
    const result = await deleteAccount(authClient, accountStorage);
    if (result === "deleted") {
      if (ownsBiometricLogin) await biometric?.vault.remove();
      // 서버의 기기 등록은 계정과 함께 지워졌다 — 이 기기의 푸시 등록과 예약한 알림을 끊는다.
      await stopNotificationsOnSignOut();
      window.location.href = "/";
      return;
    }
    setOutcome(result);
    setPending(false);
  };

  /** 새 세션을 받도록 로그아웃한다 — 다시 로그인한 뒤 바로 탈퇴할 수 있다. */
  const signOutToReauthenticate = signOutAndReload;

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
