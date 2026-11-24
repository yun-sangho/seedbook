"use client";

import { type ReactNode, useState } from "react";
import { VStack } from "@seed-design/react";
import { AppBar as SeedAppBar } from "@seed-design/stackflow";
import { useActivity } from "@stackflow/react";
import { AppTabBar, TAB_BAR_CONTENT_INSET } from "@web/components/mobile/app-tab-bar";
import { HeaderActionSlotContext } from "@web/components/mobile/header-action";
import { MobileMoreSheet } from "@web/components/mobile/mobile-more-sheet";
import { ProfileButton, ProfileSheet } from "@web/components/mobile/profile-menu";
import { usePwaInstall } from "@web/hooks/use-pwa-install";
import type { TabBarItem } from "@web/lib/native/tab-bar";
import {
  AppBar,
  AppBarBackButton,
  AppBarLeft,
  AppBarMain,
  AppBarRight,
} from "@web/seed-design/ui/app-bar";
import { AppScreen, AppScreenContent } from "@web/seed-design/ui/app-screen";
import type { TabActivityName } from "./stackflow";
import { useSwitchTab } from "./use-switch-tab";

const TABS: (TabBarItem & { key: TabActivityName })[] = [
  { key: "HomeTab", label: "홈", icon: "house" },
  { key: "AccountsTab", label: "계좌", icon: "linechart" },
  { key: "RebalancingTab", label: "리밸런싱", icon: "arrows" },
  { key: "PortfolioTab", label: "포트폴리오", icon: "barchart" },
];

/** 탭 4개 + 더보기 (화면이 아니라 시트를 연다). */
const TAB_BAR_ITEMS: TabBarItem[] = [
  ...TABS,
  { key: "more", label: "더보기", icon: "more", action: true },
];

export function tabLabel(name: TabActivityName): string {
  return TABS.find((tab) => tab.key === name)?.label ?? "Seedbook";
}

/**
 * 하단 탭 화면. 스택 맨 아래(루트)일 때만 하단 탭바·프로필 버튼을 보여주고,
 * 다른 화면에서 push 된 경우(예: 리밸런싱 상세 → 포트폴리오)는 일반 상세처럼 뒤로가기를 단다.
 */
export function TabScreen({ name, children }: { name: TabActivityName; children: ReactNode }) {
  const { isRoot, isTop } = useActivity();
  const switchTab = useSwitchTab();
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { mode: installMode, install, isIOS, isNativeApp } = usePwaInstall();

  return (
    <AppScreen>
      <AppBar>
        <AppBarLeft>
          <AppBarBackButton />
        </AppBarLeft>
        <AppBarMain title={tabLabel(name)} />
        <AppBarRight>
          {isRoot && <ProfileButton onClick={() => setProfileOpen(true)} />}
        </AppBarRight>
      </AppBar>
      <AppScreenContent>
        <div
          style={{
            // 하단 탭바(홈 인디케이터 포함)만큼 여백.
            paddingBottom: isRoot ? TAB_BAR_CONTENT_INSET : "var(--seed-safe-area-bottom)",
          }}
        >
          {children}
        </div>
      </AppScreenContent>
      {isRoot && (
        <>
          <AppTabBar
            items={TAB_BAR_ITEMS}
            current={name}
            active={isTop}
            onSelect={(key) => {
              const tab = TABS.find((t) => t.key === key);
              if (tab) switchTab(tab.key);
              else setMoreOpen(true);
            }}
          />
          <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
          <MobileMoreSheet
            open={moreOpen}
            onOpenChange={setMoreOpen}
            installMode={installMode}
            onInstall={install}
            isIOS={isIOS}
            isNativeApp={isNativeApp}
          />
        </>
      )}
    </AppScreen>
  );
}

interface DetailScreenProps {
  title: string;
  /** 제목 아래 보조 텍스트 (계좌 유형) */
  subtitle?: string;
  /** 제목 앞 색상 점 (계좌·포트폴리오 색) */
  dotColor?: string;
  children: ReactNode;
}

/**
 * 상세 화면 (push). 오른쪽 앱바 버튼("수정" 등)은 화면 안쪽에서 `<HeaderAction>` 으로
 * 넣는다 — 버튼이 여는 시트 상태가 화면 컴포넌트에 남아 있어야 해서 portal 슬롯을 쓴다.
 */
export function DetailScreen({ title, subtitle, dotColor, children }: DetailScreenProps) {
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);

  return (
    <AppScreen>
      <AppBar>
        <AppBarLeft>
          <AppBarBackButton />
        </AppBarLeft>
        <SeedAppBar.Main layout={subtitle ? "withSubtitle" : "titleOnly"}>
          <VStack overflowX="auto">
            <SeedAppBar.Title>
              {dotColor && (
                <span
                  className="mr-[6px] inline-block size-[10px] rounded-full align-middle"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden
                />
              )}
              {title}
            </SeedAppBar.Title>
            {subtitle ? <SeedAppBar.Subtitle>{subtitle}</SeedAppBar.Subtitle> : null}
          </VStack>
        </SeedAppBar.Main>
        <AppBarRight>
          <div ref={setActionSlot} className="flex items-center" />
        </AppBarRight>
      </AppBar>
      <AppScreenContent>
        <HeaderActionSlotContext.Provider value={actionSlot}>
          <div style={{ paddingBottom: "var(--seed-safe-area-bottom)" }}>{children}</div>
        </HeaderActionSlotContext.Provider>
      </AppScreenContent>
    </AppScreen>
  );
}
