"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import {
  IconArrow2ClockwiseCircularLine,
  IconArrowLeftBracketRightLine,
  IconChevronRightLine,
  IconDocumentLine,
  IconDocumentTrayLine,
  IconKeyholeShieldLine,
  IconPlusSquareLine,
  IconTrashcanLine,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { ANONYMOUS_USER_NAME } from "@seedbook/domain/anonymous-identity";
import { useFlow } from "@stackflow/react";
import { useLegalNotices } from "@web/components/consent-gate";
import { AppLockSettingItem } from "@web/components/mobile/app-lock";
import { BiometricLoginSettingItem } from "@web/components/mobile/biometric-login";
import { SessionUserAvatar, useSessionUser } from "@web/components/mobile/profile-menu";
import { separateStorageNotice } from "@web/features/settings/utils/storage-notice";
import { useBiometryLabel } from "@web/hooks/use-biometry-label";
import { usePwaInstallState } from "@web/hooks/use-pwa-install";
import { authClient } from "@web/lib/auth-client";
import { reloadApp } from "@web/lib/device-storage";
import { koreanDate, LEGAL_DOCUMENTS } from "@web/lib/legal-documents";
import { markSignedOut } from "@web/lib/native/biometric-login";
import { getStorageMode, type StorageMode } from "@web/lib/storage-mode";
import { List, ListButtonItem, ListItem } from "@web/seed-design/ui/list";

const chevron = <Icon svg={<IconChevronRightLine />} size="x5" color="fg.neutralSubtle" />;

const STORAGE_MODE_LABEL: Record<StorageMode, string> = {
  local: "이 기기에만 저장",
  cloud: "클라우드에 저장",
};

/**
 * 설정 메뉴 (앱바 프로필 버튼). 회색 바탕에 프로필 카드 → 앱 · 데이터 · 계정 · 정보 카드.
 * 하위 설정은 화면을 push 하고(꺾쇠), 바로 실행되는 항목(로그아웃·앱 잠금 등)은 꺾쇠가 없다.
 */
export function SettingsMenuMobile() {
  const { push } = useFlow();
  const user = useSessionUser();
  const legalNotices = useLegalNotices();
  const { mode: installMode, install, isIOS, isNativeApp } = usePwaInstallState();
  const biometryLabel = useBiometryLabel();
  // 저장 위치는 기기 저장소에서 읽는다 (SSR 과 어긋나지 않게 마운트 뒤에).
  const [storageMode, setStorageMode] = useState<StorageMode | null>(null);
  useEffect(() => setStorageMode(getStorageMode()), []);

  const storageNotice = storageMode && separateStorageNotice({ isIOS, isNativeApp, storageMode });
  const showAppSection =
    installMode === "prompt" || installMode === "ios-manual" || biometryLabel !== null;

  return (
    <div className="flex flex-col gap-x3 px-x4 pt-x4 pb-x8">
      <button
        type="button"
        onClick={() => push("Profile", {})}
        className="bg-bg-layer-default active:bg-bg-layer-default-pressed flex min-w-0 items-center gap-x3 rounded-[20px] px-x5 py-x5 text-left"
      >
        <SessionUserAvatar size={56} />
        <span className="flex min-w-0 flex-1 flex-col gap-x0_5">
          <span className="t6-bold text-fg-neutral truncate">
            {user?.name || ANONYMOUS_USER_NAME}
          </span>
          <span className="t3-regular text-fg-neutral-muted">아바타·닉네임 바꾸기</span>
        </span>
        {chevron}
      </button>

      {showAppSection && (
        <MenuCard title="앱">
          {installMode === "prompt" && (
            <ListButtonItem
              prefix={<Icon svg={<IconPlusSquareLine />} />}
              title="홈 화면에 앱 설치"
              detail="앱처럼 전체 화면으로 바로 열 수 있어요"
              onClick={() => void install()}
            />
          )}
          {installMode === "ios-manual" && (
            <ListItem
              prefix={<Icon svg={<IconPlusSquareLine />} />}
              title="홈 화면에 앱 설치"
              detail="Safari 하단 공유 버튼 → '홈 화면에 추가'를 눌러주세요"
            />
          )}
          <AppLockSettingItem />
          <BiometricLoginSettingItem />
        </MenuCard>
      )}

      <MenuCard title="데이터">
        <ListButtonItem
          prefix={<Icon svg={<IconArrow2ClockwiseCircularLine />} />}
          title="저장 위치"
          detail={
            storageMode
              ? [STORAGE_MODE_LABEL[storageMode], storageNotice].filter(Boolean).join(" · ")
              : undefined
          }
          suffix={chevron}
          onClick={() => push("StorageMode", {})}
        />
        <ListButtonItem
          prefix={<Icon svg={<IconDocumentTrayLine />} />}
          title="백업"
          detail="내보내기, 가져오기"
          suffix={chevron}
          onClick={() => push("DataBackup", {})}
        />
      </MenuCard>

      <MenuCard title="계정">
        <ListButtonItem
          prefix={<Icon svg={<IconKeyholeShieldLine />} />}
          title="로그인 수단"
          detail="다른 로그인 수단을 같은 계정에 연결해요"
          suffix={chevron}
          onClick={() => push("LoginMethods", {})}
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
        <ListButtonItem
          prefix={<Icon svg={<IconTrashcanLine />} />}
          title="탈퇴하기"
          suffix={chevron}
          onClick={() => push("DeleteAccount", {})}
        />
      </MenuCard>

      <MenuCard title="정보">
        {LEGAL_DOCUMENTS.map(({ id, title }) => {
          // 시행일 전 개정이 있으면 함께 알린다 (홈 배너를 닫아도 여기엔 남는다).
          const notice = legalNotices.find((n) => n.document === id);
          return (
            <ListButtonItem
              key={id}
              prefix={<Icon svg={<IconDocumentLine />} />}
              title={title}
              detail={notice ? `${koreanDate(notice.effectiveDate)}부터 바뀌어요` : undefined}
              suffix={chevron}
              onClick={() => push(id === "terms" ? "Terms" : "Privacy", {})}
            />
          );
        })}
      </MenuCard>
    </div>
  );
}

/** 흰 카드 섹션: 제목 + 목록. */
function MenuCard({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="bg-bg-layer-default min-w-0 overflow-hidden rounded-[20px] pt-x4 pb-x2"
    >
      <h2 id={titleId} className="t5-bold text-fg-neutral px-x5 pb-x1">
        {title}
      </h2>
      <List>{children}</List>
    </section>
  );
}
