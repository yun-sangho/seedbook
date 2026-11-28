"use client";

import { useEffect, useState } from "react";
import { IconFaceViewfinderLine, IconFingerprintLine } from "@karrotmarket/react-monochrome-icon";
import { useBiometricLoginDeps } from "@mobile/hooks/use-biometric-login-deps";
import { useBiometryLabel } from "@mobile/hooks/use-biometry-label";
import { useSession } from "@mobile/lib/auth-client";
import { APP_LOCK_GRACE_MS } from "@mobile/lib/native/app-lock";
import { BIOMETRY_WITH_RO, type BiometryName } from "@mobile/lib/native/biometric";
import {
  biometricProtectionEnabledFor,
  disableBiometricProtection,
  dismissBiometricLoginOffer,
  type EnrollResult,
  enableBiometricProtection,
  shouldOfferBiometricLogin,
} from "@mobile/lib/native/biometric-login";
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
import { ListButtonItem } from "@mobile/seed-design/ui/list";
import { Icon } from "@seed-design/react";

interface SessionInfo {
  userId: string;
  createdAt: Date;
}

function useSessionInfo(): SessionInfo | null {
  const { data } = useSession();
  const userId: unknown = data?.user?.id;
  const createdAt: unknown = data?.session?.createdAt;
  if (typeof userId !== "string" || !createdAt) return null;
  return { userId, createdAt: new Date(createdAt as string | Date) };
}

function biometryIcon(label: BiometryName) {
  return label === "Face ID" ? <IconFaceViewfinderLine /> : <IconFingerprintLine />;
}

const GRACE_MINUTES = APP_LOCK_GRACE_MS / 60_000;

/** 잠금은 켰는데 로그인 등록이 안 됐을 때의 안내. */
function loginFailureMessage(login: EnrollResult): string | null {
  if (login === "enrolled") return null;
  if (login === "reauth-required") {
    return "앱 잠금은 켰어요. 로그인에도 쓰려면 로그아웃한 뒤 다시 로그인해서 켜 주세요";
  }
  return "앱 잠금은 켰어요. 로그인에는 아직 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요";
}

/**
 * 로그인 직후 한 번 "다음부터 Face ID(지문)로 잠금을 풀고 로그인할까요?" 를 묻는다. 네이티브 앱에서
 * 생체 인증을 쓸 수 있고, 이 기기에 이 계정의 생체 인증 로그인이 없을 때만. "나중에" 를 고르면 다시
 * 묻지 않는다 (설정에서 켤 수 있다). 켜면 앱 잠금과 생체 인증 로그인을 함께 켠다.
 */
export function BiometricLoginOffer() {
  const deps = useBiometricLoginDeps();
  const biometryLabel = useBiometryLabel();
  const session = useSessionInfo();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const userId = session?.userId;
  const sessionCreatedAt = session?.createdAt.getTime();
  useEffect(() => {
    if (!deps || !biometryLabel || !userId || sessionCreatedAt === undefined) return;
    const offer = shouldOfferBiometricLogin(deps.storage, {
      userId,
      sessionCreatedAt: new Date(sessionCreatedAt),
      now: new Date(),
    });
    if (offer) setOpen(true);
  }, [deps, biometryLabel, userId, sessionCreatedAt]);

  if (!deps || !biometryLabel || !userId) return null;

  const close = () => {
    dismissBiometricLoginOffer(deps.storage);
    setOpen(false);
  };

  const enable = async () => {
    setBusy(true);
    const result = await enableBiometricProtection(deps, userId);
    setBusy(false);
    // 취소하면 다이얼로그를 그대로 둔다. 켰으면 (로그인 등록이 안 됐어도) 닫고 다시 묻지 않는다.
    if (result.status === "enabled") close();
  };

  const withRo = BIOMETRY_WITH_RO[biometryLabel];
  return (
    <AlertDialogRoot open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>다음부터 {withRo} 열까요?</AlertDialogTitle>
          <AlertDialogDescription>
            앱을 열 때 {withRo} 잠금을 풀고, 로그인이 풀려도 카카오 로그인 없이 바로 들어올 수
            있어요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <div className="flex w-full gap-x2">
            <AlertDialogAction variant="neutralWeak" size="large" flexGrow onClick={close}>
              나중에
            </AlertDialogAction>
            {/* 결과를 보고 닫는다 — 취소하면 다이얼로그를 그대로 둔다. */}
            <ActionButton
              variant="neutralSolid"
              size="large"
              flexGrow
              loading={busy}
              onClick={enable}
            >
              사용하기
            </ActionButton>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  );
}

/**
 * 설정 메뉴의 "Face ID(지문) 사용" 스위치. 앱 잠금과 생체 인증 로그인을 함께 켜고 끈다 (2026-11-28
 * 사용자 결정 — 둘을 따로 두면 하나만 켜져 헷갈린다). 네이티브 앱에서 생체 인증을 쓸 수 있을 때만 보인다.
 */
export function BiometricSettingItem() {
  const deps = useBiometricLoginDeps();
  const biometryLabel = useBiometryLabel();
  const session = useSessionInfo();
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const userId = session?.userId;
  // 기기 저장소의 표시만 믿지 않고 금고(Keychain/Keystore)에 토큰이 남아 있는지 함께 본다.
  useEffect(() => {
    if (!deps || !userId) return;
    let cancelled = false;
    void biometricProtectionEnabledFor(deps, userId).then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, userId]);

  if (!deps || !biometryLabel || !userId) return null;

  const toggle = async () => {
    setMessage(null);
    if (enabled) {
      await disableBiometricProtection(deps, userId);
      setEnabled(false);
      return;
    }
    const result = await enableBiometricProtection(deps, userId);
    if (result.status === "cancelled") return;
    setEnabled(true);
    setMessage(loginFailureMessage(result.login));
  };

  const status = enabled
    ? `켜짐 · 앱을 열거나 ${GRACE_MINUTES}분 넘게 떠나 있으면 잠기고, 로그인에도 써요`
    : "꺼짐 · 앱 잠금과 로그인에 써요";
  return (
    <ListButtonItem
      prefix={<Icon svg={biometryIcon(biometryLabel)} />}
      title={`${biometryLabel} 사용`}
      detail={message ?? status}
      onClick={toggle}
    />
  );
}
