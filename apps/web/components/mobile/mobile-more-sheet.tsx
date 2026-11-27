"use client";

import { useState } from "react";
import {
  IconArrowLeftBracketRightLine,
  IconDocumentLine,
  IconExclamationmarkCircleLine,
  IconGearLine,
  IconPlusSquareLine,
  IconTrashcanLine,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { ANONYMOUS_USER_NAME } from "@seedbook/database/anonymous-identity";
import { useFlow } from "@stackflow/react";
import { useLegalNotices } from "@web/components/consent-gate";
import { AppLockSettingItem } from "@web/components/mobile/app-lock";
import { BiometricLoginSettingItem } from "@web/components/mobile/biometric-login";
import { DeleteAccountDialog } from "@web/components/mobile/delete-account-dialog";
import {
  ProfileSheet,
  SessionUserAvatar,
  useSessionUser,
} from "@web/components/mobile/profile-menu";
import { authClient } from "@web/lib/auth-client";
import { reloadApp } from "@web/lib/device-storage";
import { koreanDate, LEGAL_DOCUMENTS } from "@web/lib/legal-documents";
import { markSignedOut } from "@web/lib/native/biometric-login";
import { type InstallMode, needsSeparateStorageNotice } from "@web/lib/pwa-install";
import { getStorageMode } from "@web/lib/storage-mode";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { List, ListButtonItem, ListItem } from "@web/seed-design/ui/list";

interface MobileMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installMode: InstallMode;
  onInstall: () => Promise<void>;
  isIOS: boolean;
  isNativeApp: boolean;
}

/** 하단 탭 "더보기": 내 프로필, 앱 설치, 설정, 로그아웃, 회원 탈퇴. */
export function MobileMoreSheet({
  open,
  onOpenChange,
  installMode,
  onInstall,
  isIOS,
  isNativeApp,
}: MobileMoreSheetProps) {
  const user = useSessionUser();
  const legalNotices = useLegalNotices();
  // HydrationGate 아래에서만 렌더되므로 render 중 localStorage 읽기가 SSR 과 어긋나지 않는다.
  const showStorageNotice = needsSeparateStorageNotice({
    isIOS,
    storageMode: getStorageMode(),
    isNativeApp,
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { push } = useFlow();

  return (
    <>
      <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
        <BottomSheetContent title="더보기" showHandle>
          <BottomSheetBody>
            <List>
              <ListButtonItem
                prefix={<SessionUserAvatar size={40} />}
                title={user?.name || ANONYMOUS_USER_NAME}
                detail="아바타·닉네임 바꾸기"
                onClick={() => {
                  onOpenChange(false);
                  setProfileOpen(true);
                }}
              />
              {installMode === "prompt" && (
                <ListButtonItem
                  prefix={<Icon svg={<IconPlusSquareLine />} />}
                  title="홈 화면에 앱 설치"
                  detail="앱처럼 전체 화면으로 바로 열 수 있어요"
                  onClick={async () => {
                    await onInstall();
                    onOpenChange(false);
                  }}
                />
              )}
              {installMode === "ios-manual" && (
                <ListItem
                  prefix={<Icon svg={<IconPlusSquareLine />} />}
                  title="홈 화면에 앱 설치"
                  detail="Safari 하단 공유 버튼 → '홈 화면에 추가'를 눌러주세요"
                />
              )}
              {showStorageNotice && (
                <ListItem
                  prefix={<Icon svg={<IconExclamationmarkCircleLine />} />}
                  title={
                    isNativeApp
                      ? "앱과 브라우저는 데이터가 따로 저장돼요"
                      : "Safari와 홈 화면 앱은 데이터가 따로 저장돼요"
                  }
                  detail="설정 → 저장 위치에서 '클라우드에 저장'을 고르면 어디서든 같은 데이터를 볼 수 있어요"
                />
              )}
              <AppLockSettingItem />
              <BiometricLoginSettingItem />
              <ListButtonItem
                prefix={<Icon svg={<IconGearLine />} />}
                title="설정"
                detail="저장 위치, 데이터 백업"
                onClick={() => {
                  onOpenChange(false);
                  push("Settings", {});
                }}
              />
              <ListButtonItem
                prefix={<Icon svg={<IconArrowLeftBracketRightLine />} />}
                title="로그아웃"
                onClick={async () => {
                  // 로그인 화면이 생체 인증 프롬프트를 곧바로 다시 띄우지 않게 한다. signOut 이
                  // 끝나면 바로 로그인 화면이 그려지므로 그 전에 남긴다.
                  markSignedOut(window.sessionStorage);
                  await authClient.signOut();
                  await reloadApp();
                }}
              />
              {LEGAL_DOCUMENTS.map(({ id, title, href }) => {
                // 시행일 전 개정이 있으면 함께 알린다 (홈 배너를 닫아도 여기엔 남는다).
                const notice = legalNotices.find((n) => n.document === id);
                return (
                  <ListButtonItem
                    key={id}
                    prefix={<Icon svg={<IconDocumentLine />} />}
                    title={title}
                    detail={notice ? `${koreanDate(notice.effectiveDate)}부터 바뀌어요` : undefined}
                    onClick={() => {
                      window.location.href = href;
                    }}
                  />
                );
              })}
              <ListButtonItem
                prefix={<Icon svg={<IconTrashcanLine />} />}
                title="회원 탈퇴"
                onClick={() => {
                  onOpenChange(false);
                  setDeleteOpen(true);
                }}
              />
            </List>
          </BottomSheetBody>
        </BottomSheetContent>
      </BottomSheetRoot>
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
