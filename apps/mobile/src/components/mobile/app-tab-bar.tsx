"use client";

import { type ReactElement, useEffect, useRef, useSyncExternalStore } from "react";
import {
  IconArrowUpArrowDownFill,
  IconBarchartSquareFill,
  IconDot3HorizontalFill,
  IconHouseFill,
  IconLinechartUpXaxisFill,
} from "@karrotmarket/react-monochrome-icon";
import { nativeTabBar, type TabBarItem, type TabIcon } from "@mobile/lib/native/tab-bar";
import { cn } from "@mobile/lib/utils";
import { Icon } from "@seed-design/react";

const WEB_TAB_BAR_HEIGHT = "56px";

/** 탭 화면 콘텐츠가 탭바에 가리지 않게 두는 아래 여백. 네이티브 탭바는 실제 높이를 알려준다. */
export const TAB_BAR_CONTENT_INSET = `var(--app-tab-bar-inset, calc(${WEB_TAB_BAR_HEIGHT} + var(--seed-safe-area-bottom)))`;

// SEED Bottom Navigation: 아이콘은 Fill 하나만 쓰고 선택 여부는 색으로 구분한다.
const ICONS: Record<TabIcon, ReactElement> = {
  house: <IconHouseFill />,
  linechart: <IconLinechartUpXaxisFill />,
  arrows: <IconArrowUpArrowDownFill />,
  barchart: <IconBarchartSquareFill />,
  more: <IconDot3HorizontalFill />,
};

interface AppTabBarProps {
  items: readonly TabBarItem[];
  current: string;
  /** 이 화면이 맨 위에 있는지. 네이티브 탭바는 화면 밖에 있어 가려지면 직접 내려야 한다. */
  active: boolean;
  /** 지금 탭이 아닌 항목을 눌렀을 때. */
  onSelect: (key: string) => void;
}

/**
 * 하단 탭바. 네이티브 탭바가 있는 앱에서는 그것을 쓰고, 브라우저·PWA·구버전 앱에서는 SEED Bottom
 * Navigation 을 그린다 (SEED React 구현이 없어 가이드대로 조합). 탭 화면 맨 아래에 둔다.
 */
export function AppTabBar({ items, current, active, onSelect }: AppTabBarProps) {
  const mode = useSyncExternalStore(
    nativeTabBar.subscribe,
    nativeTabBar.getMode,
    () => "web" as const
  );

  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (mode !== "native" || !active) return;
    return nativeTabBar.show({
      items,
      selected: current,
      onSelect: (key) => {
        if (key !== current) onSelectRef.current(key);
      },
    });
  }, [mode, active, items, current]);

  if (mode === "native") return null;

  return (
    <nav
      aria-label="주 메뉴"
      className="bg-bg-layer-default border-stroke-neutral-subtle absolute inset-x-0 bottom-0 border-t"
      // 앱 스크린의 콘텐츠 레이어보다 위 (AppBar 와 같은 층).
      style={{ paddingBottom: "var(--seed-safe-area-bottom)", zIndex: "var(--z-index-app-bar)" }}
    >
      <ul className="mx-auto flex max-w-[480px]" style={{ height: WEB_TAB_BAR_HEIGHT }}>
        {items.map((item) => {
          const selected = item.key === current;
          return (
            <li key={item.key} className="flex-1">
              <button
                type="button"
                aria-current={selected ? "page" : undefined}
                aria-haspopup={item.action ? "dialog" : undefined}
                onClick={() => {
                  if (!selected) onSelect(item.key);
                }}
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center gap-x1",
                  selected
                    ? "t1-static-bold text-fg-neutral"
                    : "t1-static-medium text-fg-neutral-subtle"
                )}
              >
                <Icon svg={ICONS[item.icon]} size="x6" />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
