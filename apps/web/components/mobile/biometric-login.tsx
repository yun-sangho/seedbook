"use client";

import { useEffect, useState } from "react";
import { IconFaceViewfinderLine, IconFingerprintLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useBiometricLoginDeps } from "@web/hooks/use-biometric-login-deps";
import { useBiometryLabel } from "@web/hooks/use-biometry-label";
import { useSession } from "@web/lib/auth-client";
import { BIOMETRY_WITH_RO, type BiometryName } from "@web/lib/native/biometric";
import {
  disableBiometricLogin,
  dismissBiometricLoginOffer,
  type EnrollResult,
  enrollBiometricLogin,
  isBiometricLoginEnrolledFor,
  shouldOfferBiometricLogin,
} from "@web/lib/native/biometric-login";
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
import { ListButtonItem } from "@web/seed-design/ui/list";

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

const ENROLL_FAILURE_MESSAGE: Record<Exclude<EnrollResult, "enrolled">, string | null> = {
  cancelled: null,
  "reauth-required": "보안을 위해 로그아웃한 뒤 다시 로그인해서 켜 주세요",
  failed: "켜지 못했어요. 잠시 뒤 다시 시도해 주세요",
};

/**
 * 로그인 직후 한 번 "다음부터 Face ID(지문)로 로그인할까요?" 를 묻는다. 네이티브 앱에서 생체
 * 인증을 쓸 수 있고, 이 기기에 아직 켜지 않았을 때만. "나중에" 를 고르면 다시 묻지 않는다
 * (설정 → 생체 인증 로그인에서 켤 수 있다).
 */
export function BiometricLoginOffer() {
  const deps = useBiometricLoginDeps();
  const biometryLabel = useBiometryLabel();
  const session = useSessionInfo();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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

  const enroll = async () => {
    setBusy(true);
    const result = await enrollBiometricLogin(deps, userId);
    setBusy(false);
    if (result === "enrolled") {
      setOpen(false);
      return;
    }
    if (result !== "cancelled") {
      dismissBiometricLoginOffer(deps.storage);
      setMessage(ENROLL_FAILURE_MESSAGE[result]);
    }
  };

  const withRo = BIOMETRY_WITH_RO[biometryLabel];
  return (
    <AlertDialogRoot open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>다음부터 {withRo} 로그인할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            {message ?? `로그인이 풀려도 카카오 로그인 없이 ${withRo} 바로 들어올 수 있어요.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <div className="flex w-full gap-x2">
            <AlertDialogAction variant="neutralWeak" size="large" flexGrow onClick={close}>
              나중에
            </AlertDialogAction>
            {/* 결과를 보고 닫는다 — 취소·실패면 다이얼로그를 그대로 둔다. */}
            <ActionButton
              variant="brandSolid"
              size="large"
              flexGrow
              loading={busy}
              onClick={enroll}
            >
              사용하기
            </ActionButton>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  );
}

/** 설정 메뉴의 "생체 인증 로그인" 켜기/끄기. 네이티브 앱에서 생체 인증을 쓸 수 있을 때만 보인다. */
export function BiometricLoginSettingItem() {
  const deps = useBiometricLoginDeps();
  const biometryLabel = useBiometryLabel();
  const session = useSessionInfo();
  const [enrolled, setEnrolled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const userId = session?.userId;
  useEffect(() => {
    if (deps && userId) setEnrolled(isBiometricLoginEnrolledFor(deps.storage, userId));
  }, [deps, userId]);

  if (!deps || !biometryLabel || !userId) return null;

  const toggle = async () => {
    setMessage(null);
    if (enrolled) {
      await disableBiometricLogin(deps);
      setEnrolled(false);
      return;
    }
    const result = await enrollBiometricLogin(deps, userId);
    if (result === "enrolled") setEnrolled(true);
    else setMessage(ENROLL_FAILURE_MESSAGE[result]);
  };

  const status = enrolled ? "켜짐 · 로그인할 때 카카오 대신 쓸 수 있어요" : "꺼짐";
  return (
    <ListButtonItem
      prefix={<Icon svg={biometryIcon(biometryLabel)} />}
      title={`${BIOMETRY_WITH_RO[biometryLabel]} 로그인`}
      detail={message ?? status}
      onClick={toggle}
    />
  );
}
