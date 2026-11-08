"use client";

import {
  IconArrowLeftBracketRightLine,
  IconLaptopLine,
  IconPlusSquareLine,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { authClient, useSession } from "@web/lib/auth-client";
import type { InstallMode } from "@web/lib/pwa-install";
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
}

/** 하단 탭 "더보기": 앱 설치, PC 화면 전환, 로그아웃. */
export function MobileMoreSheet({
  open,
  onOpenChange,
  installMode,
  onInstall,
}: MobileMoreSheetProps) {
  const { data: session } = useSession();
  const user = session?.user as { name?: string | null; email?: string | null } | undefined;

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
            <ListButtonItem
              prefix={<Icon svg={<IconLaptopLine />} />}
              title="PC 화면으로 보기"
              detail="자산 계획·저축 등 전체 기능"
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
