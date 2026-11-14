"use client";

import {
  IconArrowLeftBracketRightLine,
  IconExclamationmarkCircleLine,
  IconLaptopLine,
  IconPlusSquareLine,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { authClient, useSession } from "@web/lib/auth-client";
import { type InstallMode, needsSeparateStorageNotice } from "@web/lib/pwa-install";
import { getStorageMode } from "@web/lib/storage-mode";
import { setViewOverride } from "@web/lib/view-override";
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
}

/** 하단 탭 "더보기": 앱 설치, PC 화면 전환, 로그아웃. */
export function MobileMoreSheet({
  open,
  onOpenChange,
  installMode,
  onInstall,
  isIOS,
}: MobileMoreSheetProps) {
  const { data: session } = useSession();
  const user = session?.user as { name?: string | null; email?: string | null } | undefined;
  // HydrationGate 아래에서만 렌더되므로 render 중 localStorage 읽기가 SSR 과 어긋나지 않는다.
  const showStorageNotice = needsSeparateStorageNotice({ isIOS, storageMode: getStorageMode() });

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title={user?.name ?? "더보기"}
        description={user?.email ?? undefined}
        showHandle
      >
        <BottomSheetBody>
          <List>
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
                title="Safari와 홈 화면 앱은 데이터가 따로 저장돼요"
                detail="PC 화면 → 관리 → 저장소 설정에서 '클라우드에 저장'을 켜면 어디서든 같은 데이터를 볼 수 있어요"
              />
            )}
            <ListButtonItem
              prefix={<Icon svg={<IconLaptopLine />} />}
              title="PC 화면으로 보기"
              detail="계좌 순서 변경 등 PC 전용 기능"
              onClick={() => {
                setViewOverride("desktop");
                window.location.reload();
              }}
            />
            <ListButtonItem
              prefix={<Icon svg={<IconArrowLeftBracketRightLine />} />}
              title="로그아웃"
              onClick={async () => {
                await authClient.signOut();
                window.location.reload();
              }}
            />
          </List>
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}
