"use client";

import { Activity, type ReactNode, useState } from "react";
import { AppTabBar, TAB_BAR_CONTENT_INSET } from "@mobile/components/mobile/app-tab-bar";
import { BottomActionSlotContext } from "@mobile/components/mobile/bottom-action";
import { HeaderActionSlotContext } from "@mobile/components/mobile/header-action";
import { ProfileButton } from "@mobile/components/mobile/profile-menu";
import type { TabBarItem } from "@mobile/lib/native/tab-bar";
import {
  AppBar,
  AppBarBackButton,
  AppBarLeft,
  AppBarMain,
  AppBarRight,
} from "@mobile/seed-design/ui/app-bar";
import { AppScreen, AppScreenContent } from "@mobile/seed-design/ui/app-screen";
import { VStack } from "@seed-design/react";
import { AppBar as SeedAppBar } from "@seed-design/stackflow";
import { useActivity, useFlow } from "@stackflow/react";
import { switchTab } from "./stack-control";
import { TAB_KEYS, type TabKey } from "./tabs";

const TABS: (TabBarItem & { key: TabKey })[] = [
  { key: "home", label: "홈", icon: "house" },
  { key: "accounts", label: "계좌", icon: "linechart" },
  { key: "rebalancing", label: "리밸런싱", icon: "arrows" },
  { key: "portfolios", label: "포트폴리오", icon: "barchart" },
];

function tabLabel(key: TabKey): string {
  return TABS.find((tab) => tab.key === key)?.label ?? "Seedbook";
}

interface TabsScreenProps {
  current: TabKey;
  screens: Record<TabKey, ReactNode>;
  /**
   * 화면 높이에 맞춰 스스로 스크롤하는 탭 (정원 홈: 위는 고정 높이 정원, 아래만 스크롤). 이 탭들은
   * 바깥에서 스크롤하지 않고 세로 flex 로 채운다.
   */
  fixedHeight?: readonly TabKey[];
}

/**
 * 하단 탭 화면 4개. 한 번 연 탭은 숨겨도 화면(스크롤·입력)이 남는다 — 숨은 탭은 `<Activity>` 가
 * effect 를 멈춰 시세 갱신·store 구독이 돌지 않고, 다시 보일 때 최신 값으로 그린다.
 *
 * 스택 맨 아래(루트)일 때만 하단 탭바·프로필 버튼을 보여주고 (프로필 버튼 → 설정 메뉴로 push.
 * 설정으로 가는 길은 이것 하나다), 다른 화면에서 push 된 경우
 * (예: 리밸런싱 상세 → 포트폴리오)는 일반 상세처럼 뒤로가기를 단다.
 *
 * 화면 전환·스와이프는 activity 마다 첫 번째 레이어만 움직이므로, 레이어(AppScreenContent)는
 * 하나만 두고 그 안에서 탭마다 따로 스크롤한다.
 */
export function TabsScreen({ current, screens, fixedHeight = [] }: TabsScreenProps) {
  const { isRoot, isTop } = useActivity();
  const [opened, setOpened] = useState<readonly TabKey[]>([current]);
  if (!opened.includes(current)) setOpened([...opened, current]);
  const { push } = useFlow();
  // 하단 탭바(홈 인디케이터 포함)만큼 여백.
  const bottomInset = isRoot ? TAB_BAR_CONTENT_INSET : "var(--seed-safe-area-bottom)";

  return (
    <AppScreen>
      <AppBar>
        <AppBarLeft>
          <AppBarBackButton />
        </AppBarLeft>
        <AppBarMain title={tabLabel(current)} />
        <AppBarRight>
          {isRoot && <ProfileButton onClick={() => push("Settings", {})} />}
        </AppBarRight>
      </AppBar>
      <AppScreenContent style={{ overflowY: "hidden" }}>
        {TAB_KEYS.filter((key) => opened.includes(key)).map((key) => (
          <Activity key={key} mode={key === current ? "visible" : "hidden"}>
            {fixedHeight.includes(key) ? (
              <div className="flex h-full flex-col" style={{ paddingBottom: bottomInset }}>
                {screens[key]}
              </div>
            ) : (
              <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
                <div style={{ paddingBottom: bottomInset }}>{screens[key]}</div>
              </div>
            )}
          </Activity>
        ))}
      </AppScreenContent>
      {isRoot && (
        <AppTabBar
          items={TABS}
          current={current}
          active={isTop}
          onSelect={(key) => {
            const tab = TABS.find((t) => t.key === key);
            if (tab) switchTab(tab.key);
          }}
        />
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
  /** 카드 섹션을 얹는 회색 바탕 (설정 메뉴). */
  basement?: boolean;
  children: ReactNode;
}

/**
 * 상세 화면 (push). 오른쪽 앱바 버튼("수정" 등)은 화면 안쪽에서 `<HeaderAction>` 으로
 * 넣는다 — 버튼이 여는 시트 상태가 화면 컴포넌트에 남아 있어야 해서 portal 슬롯을 쓴다.
 */
export function DetailScreen({
  title,
  subtitle,
  dotColor,
  basement = false,
  children,
}: DetailScreenProps) {
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);
  const [bottomSlot, setBottomSlot] = useState<HTMLElement | null>(null);

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
          <BottomActionSlotContext.Provider value={bottomSlot}>
            <div
              className={`group flex min-h-full flex-col ${basement ? "bg-bg-layer-basement" : ""}`}
            >
              <div className="min-w-0 flex-1">{children}</div>
              {/* 비어 있으면 안전 영역 여백만, 입력 중에는 키보드 위를 가리지 않게 고정하지 않는다. */}
              <div
                ref={setBottomSlot}
                className={`bg-bg-layer-default sticky bottom-0 z-10 empty:static group-has-[input:focus]:static ${basement ? "empty:bg-transparent" : ""}`}
                style={{ paddingBottom: "var(--seed-safe-area-bottom)" }}
              />
            </div>
          </BottomActionSlotContext.Provider>
        </HeaderActionSlotContext.Provider>
      </AppScreenContent>
    </AppScreen>
  );
}
