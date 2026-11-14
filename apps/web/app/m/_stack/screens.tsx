"use client";

import { type ReactNode, useState } from "react";
import {
  IconArrowUpArrowDownFill,
  IconArrowUpArrowDownLine,
  IconBarchartSquareFill,
  IconBarchartSquareLine,
  IconDot3HorizontalLine,
  IconHouseFill,
  IconHouseLine,
  IconLinechartUpXaxisFill,
  IconLinechartUpXaxisLine,
} from "@karrotmarket/react-monochrome-icon";
import { Icon, VStack } from "@seed-design/react";
import { AppBar as SeedAppBar } from "@seed-design/stackflow";
import { useActivity } from "@stackflow/react";
import { HeaderActionSlotContext } from "@web/components/mobile/header-action";
import { MobileMoreSheet } from "@web/components/mobile/mobile-more-sheet";
import { ProfileButton, ProfileSheet } from "@web/components/mobile/profile-menu";
import { usePwaInstall } from "@web/hooks/use-pwa-install";
import { cn } from "@web/lib/utils";
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

const TAB_BAR_HEIGHT = "56px";

const TABS: {
  name: TabActivityName;
  label: string;
  icon: ReactNode;
  activeIcon: ReactNode;
}[] = [
  { name: "HomeTab", label: "홈", icon: <IconHouseLine />, activeIcon: <IconHouseFill /> },
  {
    name: "AccountsTab",
    label: "계좌",
    icon: <IconLinechartUpXaxisLine />,
    activeIcon: <IconLinechartUpXaxisFill />,
  },
  {
    name: "RebalancingTab",
    label: "리밸런싱",
    icon: <IconArrowUpArrowDownLine />,
    activeIcon: <IconArrowUpArrowDownFill />,
  },
  {
    name: "PortfolioTab",
    label: "포트폴리오",
    icon: <IconBarchartSquareLine />,
    activeIcon: <IconBarchartSquareFill />,
  },
];

export function tabLabel(name: TabActivityName): string {
  return TABS.find((t) => t.name === name)?.label ?? "Seedbook";
}

/**
 * 하단 탭 화면. 스택 맨 아래(루트)일 때만 하단 탭바·프로필 버튼을 보여주고,
 * 다른 화면에서 push 된 경우(예: 리밸런싱 상세 → 포트폴리오)는 일반 상세처럼 뒤로가기를 단다.
 */
export function TabScreen({ name, children }: { name: TabActivityName; children: ReactNode }) {
  const { isRoot } = useActivity();
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { mode: installMode, install, isIOS } = usePwaInstall();

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
            // 하단 탭바 + 홈 인디케이터만큼 여백.
            paddingBottom: isRoot
              ? `calc(${TAB_BAR_HEIGHT} + var(--seed-safe-area-bottom))`
              : "var(--seed-safe-area-bottom)",
          }}
        >
          {children}
        </div>
      </AppScreenContent>
      {isRoot && (
        <>
          <BottomTabBar current={name} onMore={() => setMoreOpen(true)} />
          <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
          <MobileMoreSheet
            open={moreOpen}
            onOpenChange={setMoreOpen}
            installMode={installMode}
            onInstall={install}
            isIOS={isIOS}
          />
        </>
      )}
    </AppScreen>
  );
}

function BottomTabBar({ current, onMore }: { current: TabActivityName; onMore: () => void }) {
  const switchTab = useSwitchTab();
  return (
    <nav
      aria-label="주 메뉴"
      className="bg-bg-layer-default border-stroke-neutral-subtle absolute inset-x-0 bottom-0 border-t"
      // 앱 스크린의 콘텐츠 레이어보다 위 (AppBar 와 같은 층).
      style={{ paddingBottom: "var(--seed-safe-area-bottom)", zIndex: "var(--z-index-app-bar)" }}
    >
      <ul className="flex" style={{ height: TAB_BAR_HEIGHT }}>
        {TABS.map((tab) => {
          const active = tab.name === current;
          return (
            <li key={tab.name} className="flex-1">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (!active) switchTab(tab.name);
                }}
                className={cn(
                  "t2-medium flex h-full w-full flex-col items-center justify-center gap-x1",
                  active ? "text-fg-neutral" : "text-fg-neutral-subtle"
                )}
              >
                <Icon svg={active ? tab.activeIcon : tab.icon} size="x6" />
                {tab.label}
              </button>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={onMore}
            className="t2-medium text-fg-neutral-subtle flex h-full w-full flex-col items-center justify-center gap-x1"
          >
            <Icon svg={<IconDot3HorizontalLine />} size="x6" />
            더보기
          </button>
        </li>
      </ul>
    </nav>
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
