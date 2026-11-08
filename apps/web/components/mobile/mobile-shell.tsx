"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBarchartSquareFill,
  IconBarchartSquareLine,
  IconChevronLeftLine,
  IconDot3HorizontalLine,
  IconLinechartUpXaxisFill,
  IconLinechartUpXaxisLine,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { SyncIndicator } from "@web/components/sync-indicator";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { SharedViewBanner } from "@web/features/sharing/components/shared-view-banner";
import { usePwaInstall } from "@web/hooks/use-pwa-install";
import { cn } from "@web/lib/utils";
import { HeaderActionSlotContext } from "./header-action";
import { MobileMoreSheet } from "./mobile-more-sheet";

const TABS = [
  {
    href: "/assets/investments",
    label: "투자",
    icon: <IconLinechartUpXaxisLine />,
    activeIcon: <IconLinechartUpXaxisFill />,
  },
  {
    href: "/assets/portfolio",
    label: "포트폴리오",
    icon: <IconBarchartSquareLine />,
    activeIcon: <IconBarchartSquareFill />,
  },
] as const;

const PORTFOLIO_DETAIL = /^\/assets\/portfolio\/([^/]+)$/;
const ACCOUNT_DETAIL = /^\/assets\/investments\/([^/]+)$/;

interface ScreenTitle {
  title: string;
  backHref: string | null;
  /** 제목 앞 색상 점 (계좌 색) */
  dotColor?: string;
  /** 제목 옆 보조 텍스트 (계좌 유형) */
  subtitle?: string;
}

function useScreenTitle(pathname: string): ScreenTitle {
  const portfolioId = pathname.match(PORTFOLIO_DETAIL)?.[1];
  const accountId = pathname.match(ACCOUNT_DETAIL)?.[1];
  const portfolioName = usePortfolioStore((s) =>
    portfolioId ? s.portfolios.find((p) => p.id === portfolioId)?.name : undefined
  );
  // 계좌 객체 자체를 고른다 (새 객체를 만들지 않아 리렌더가 안정적).
  const account = useInvestmentStore((s) =>
    accountId ? s.investments.find((inv) => inv.id === accountId) : undefined
  );
  if (portfolioId) {
    return { title: portfolioName || "포트폴리오", backHref: "/assets/portfolio" };
  }
  if (accountId) {
    return {
      title: account?.accountName || "계좌",
      backHref: "/assets/investments",
      dotColor: account?.color,
      subtitle: account?.accountType,
    };
  }
  const tab = TABS.find((t) => t.href === pathname);
  return { title: tab?.label ?? "Seedbook", backHref: null };
}

/**
 * 모바일 앱 셸: 상단 앱바 + 하단 탭바. 투자·포트폴리오만 노출한다.
 * 노치/홈 인디케이터 영역은 SEED safe-area 변수로 비워둔다.
 */
export function MobileShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { title, backHref, dotColor, subtitle } = useScreenTitle(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);
  // 계좌 상세는 앱바 오른쪽에 계좌 설정 버튼을 둔다.
  const hasHeaderAction = ACCOUNT_DETAIL.test(pathname);
  const { mode: installMode, install } = usePwaInstall();

  return (
    <HeaderActionSlotContext.Provider value={actionSlot}>
      <div
        className="bg-bg-layer-default text-fg-neutral flex min-h-dvh w-full flex-col"
        style={{ fontFamily: "var(--seed-font-family)" }}
      >
        <header
          className="bg-bg-layer-default border-stroke-neutral-subtle sticky top-0 z-[1] border-b"
          style={{ paddingTop: "var(--seed-safe-area-top)" }}
        >
          <div className="flex h-[52px] items-center gap-x1 px-x2">
            {backHref ? (
              <Link
                href={backHref}
                aria-label="뒤로"
                className="text-fg-neutral flex size-x10 items-center justify-center"
              >
                <Icon svg={<IconChevronLeftLine />} size="x6" />
              </Link>
            ) : (
              <span className="w-x2" />
            )}
            <div className="flex min-w-0 flex-1 items-center gap-x2">
              {dotColor && (
                <span
                  className="size-[10px] shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden
                />
              )}
              <h1 className="t6-bold min-w-0 truncate">{title}</h1>
              {subtitle && (
                <span className="t3-medium text-fg-neutral-subtle shrink-0">{subtitle}</span>
              )}
            </div>
            {/* 오른쪽 슬롯: 화면이 HeaderAction 으로 버튼을 넣으면 동기화 표시 대신 그 버튼을 보여준다. */}
            <div ref={setActionSlot} className="flex items-center empty:hidden" />
            {!hasHeaderAction && (
              <div className="pr-x2">
                <SyncIndicator />
              </div>
            )}
          </div>
        </header>

        <SharedViewBanner />

        <main
          className="flex-1"
          // 하단 탭바(56px) + 홈 인디케이터만큼 여백.
          style={{ paddingBottom: "calc(56px + var(--seed-safe-area-bottom))" }}
        >
          {children}
        </main>

        <nav
          aria-label="주 메뉴"
          className="bg-bg-layer-default border-stroke-neutral-subtle fixed inset-x-0 bottom-0 z-[1] border-t"
          style={{ paddingBottom: "var(--seed-safe-area-bottom)" }}
        >
          <ul className="flex h-[56px]">
            {TABS.map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
              return (
                <li key={tab.href} className="flex-1">
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "t2-medium flex h-full flex-col items-center justify-center gap-x1",
                      active ? "text-fg-neutral" : "text-fg-neutral-subtle"
                    )}
                  >
                    <Icon svg={active ? tab.activeIcon : tab.icon} size="x6" />
                    {tab.label}
                  </Link>
                </li>
              );
            })}
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="t2-medium text-fg-neutral-subtle flex h-full w-full flex-col items-center justify-center gap-x1"
              >
                <Icon svg={<IconDot3HorizontalLine />} size="x6" />
                더보기
              </button>
            </li>
          </ul>
        </nav>

        <MobileMoreSheet
          open={moreOpen}
          onOpenChange={setMoreOpen}
          installMode={installMode}
          onInstall={install}
        />
      </div>
    </HeaderActionSlotContext.Provider>
  );
}
